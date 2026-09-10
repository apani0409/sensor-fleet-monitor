"""
Sensor fleet analysis pipeline — Intel Berkeley Research Lab deployment.

Source: 54 wireless sensor nodes deployed 2004-02-28 to 2004-04-05, reporting
temperature, humidity, light and battery voltage roughly every 31 seconds.
2.3M readings. http://db.csail.mit.edu/labdata/labdata.html

This is real deployment data, which means it is genuinely broken in places:
nodes die as batteries drain, readings drift wildly before they do, whole
stretches go missing. That is the point — the failure modes are the subject.

Outputs compact JSON artifacts consumed by the web dashboard.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).parent
OUT = HERE.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

# Physical plausibility bounds for the Mica2Dot sensor board. Anything outside
# these is a hardware artifact, not weather.
TEMP_RANGE = (-10.0, 60.0)
HUMIDITY_RANGE = (0.0, 100.0)
VOLTAGE_RANGE = (1.8, 3.5)
# Below this the mote's ADC reference collapses and readings stop meaning
# anything. This threshold is what the drift analysis below establishes.
VOLTAGE_CRITICAL = 2.4


def load_readings() -> pd.DataFrame:
    print("Loading raw readings...")
    df = pd.read_csv(
        HERE / "labdata.txt",
        sep=r"\s+",
        header=None,
        names=["date", "time", "epoch", "node", "temperature", "humidity", "light", "voltage"],
        engine="c",
        on_bad_lines="skip",
        dtype={"date": "string", "time": "string"},
    )
    print(f"  {len(df):,} raw rows")

    df["timestamp"] = pd.to_datetime(
        df["date"] + " " + df["time"], format="mixed", errors="coerce"
    )
    for col in ["node", "temperature", "humidity", "light", "voltage"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["timestamp", "node"])
    df["node"] = df["node"].astype(int)
    df = df[(df["node"] >= 1) & (df["node"] <= 54)]
    df = df.drop(columns=["date", "time", "epoch"])
    print(f"  {len(df):,} rows with a usable timestamp and node id")
    return df


def flag_quality(df: pd.DataFrame) -> pd.DataFrame:
    """Marks physically impossible readings without deleting them.

    They are evidence of hardware failure, so they are kept and labelled
    rather than silently dropped — but they are excluded from every
    aggregate that is meant to describe the environment.
    """
    df["temp_valid"] = df["temperature"].between(*TEMP_RANGE)
    df["humidity_valid"] = df["humidity"].between(*HUMIDITY_RANGE)
    df["voltage_valid"] = df["voltage"].between(*VOLTAGE_RANGE)
    df["valid"] = df["temp_valid"] & df["humidity_valid"] & df["voltage_valid"]

    n_bad = int((~df["valid"]).sum())
    print(f"  {n_bad:,} readings ({n_bad / len(df):.1%}) outside physical bounds")
    print(f"    temperature: {int((~df['temp_valid']).sum()):,}")
    print(f"    humidity:    {int((~df['humidity_valid']).sum()):,}")
    print(f"    voltage:     {int((~df['voltage_valid']).sum()):,}")
    return df


def hourly_aggregate(df: pd.DataFrame) -> pd.DataFrame:
    print("Aggregating to hourly per node...")
    df["hour"] = df["timestamp"].dt.floor("h")

    valid = df[df["valid"]]
    agg = (
        valid.groupby(["node", "hour"])
        .agg(
            temperature=("temperature", "mean"),
            humidity=("humidity", "mean"),
            light=("light", "mean"),
            voltage=("voltage", "mean"),
            readings=("temperature", "size"),
        )
        .reset_index()
    )

    # Invalid readings are counted separately so data quality stays visible
    # at the same granularity as the measurements themselves.
    bad = (
        df[~df["valid"]]
        .groupby(["node", "hour"])
        .size()
        .reset_index(name="invalid_readings")
    )
    agg = agg.merge(bad, on=["node", "hour"], how="outer")
    agg["invalid_readings"] = agg["invalid_readings"].fillna(0).astype(int)
    agg["readings"] = agg["readings"].fillna(0).astype(int)

    print(f"  {len(agg):,} node-hours")
    return agg.sort_values(["node", "hour"]).reset_index(drop=True)


def add_fleet_consensus(agg: pd.DataFrame) -> pd.DataFrame:
    """Deviation of each node from the fleet median at the same hour.

    With no reference instrument, the fleet is its own reference: most nodes
    are healthy most of the time, so the median across nodes is a robust
    estimate of the true ambient value. A node drifting away from it is the
    signal we care about.
    """
    fleet = (
        agg.groupby("hour")
        .agg(fleet_temp=("temperature", "median"), fleet_humidity=("humidity", "median"))
        .reset_index()
    )
    agg = agg.merge(fleet, on="hour", how="left")
    agg["temp_deviation"] = agg["temperature"] - agg["fleet_temp"]
    agg["humidity_deviation"] = agg["humidity"] - agg["fleet_humidity"]
    return agg


def voltage_drift_model(agg: pd.DataFrame) -> dict:
    """Quantifies the battery-drift failure mode.

    Bins nodes by battery voltage and measures how far their readings stray
    from the fleet consensus. If the relationship is real, absolute deviation
    should climb sharply as voltage falls.
    """
    print("Modelling battery-driven drift...")
    sample = agg.dropna(subset=["voltage", "temp_deviation"]).copy()
    sample["abs_dev"] = sample["temp_deviation"].abs()

    bins = [1.8, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.5]
    sample["bin"] = pd.cut(sample["voltage"], bins=bins)
    curve = (
        sample.groupby("bin", observed=True)["abs_dev"]
        .agg(["median", "mean", "count"])
        .reset_index()
    )

    corr = float(sample["voltage"].corr(sample["abs_dev"]))
    healthy = sample[sample["voltage"] >= VOLTAGE_CRITICAL]["abs_dev"].median()
    failing = sample[sample["voltage"] < VOLTAGE_CRITICAL]["abs_dev"].median()

    print(f"  corr(voltage, |deviation|) = {corr:.3f}")
    print(f"  median |deviation|: healthy {healthy:.2f} °C vs failing {failing:.2f} °C")

    return {
        "correlation": round(corr, 4),
        "medianDeviationHealthy": round(float(healthy), 3),
        "medianDeviationFailing": round(float(failing), 3),
        "voltageCritical": VOLTAGE_CRITICAL,
        "curve": [
            {
                "voltageFrom": round(float(row["bin"].left), 2),
                "voltageTo": round(float(row["bin"].right), 2),
                "medianAbsDeviation": round(float(row["median"]), 3),
                "meanAbsDeviation": round(float(row["mean"]), 3),
                "samples": int(row["count"]),
            }
            for _, row in curve.iterrows()
        ],
    }


def anomaly_detection(agg: pd.DataFrame) -> pd.DataFrame:
    """Isolation Forest over the multivariate sensor state.

    Unsupervised on purpose: there are no ground-truth anomaly labels in this
    dataset, so the model flags records that are unusual across temperature,
    humidity, light, voltage and fleet deviation jointly — which catches
    combinations no single threshold would.
    """
    print("Fitting Isolation Forest...")
    features = ["temperature", "humidity", "light", "voltage", "temp_deviation"]
    data = agg.dropna(subset=features).copy()

    model = make_pipeline(
        StandardScaler(),
        IsolationForest(n_estimators=200, contamination=0.03, random_state=42),
    )
    model.fit(data[features])

    data["anomaly_score"] = -model["isolationforest"].score_samples(
        model["standardscaler"].transform(data[features])
    )
    data["is_anomaly"] = model.predict(data[features]) == -1

    agg = agg.merge(
        data[["node", "hour", "anomaly_score", "is_anomaly"]], on=["node", "hour"], how="left"
    )
    agg["is_anomaly"] = agg["is_anomaly"].fillna(False)
    n = int(agg["is_anomaly"].sum())
    print(f"  {n:,} node-hours flagged ({n / len(agg):.1%})")
    return agg


def failure_prediction(agg: pd.DataFrame) -> dict:
    """Predicts whether a node goes permanently silent within 24 hours.

    This is the question an operations team actually has: which sensors am I
    about to lose? Features are deliberately simple and available in real
    time — current voltage plus how fast it is falling.
    """
    print("Training failure prediction...")
    df = agg.dropna(subset=["voltage"]).sort_values(["node", "hour"]).copy()

    # Label: no further readings from this node after the next 24 hours.
    last_seen = df.groupby("node")["hour"].transform("max")
    df["hours_to_silence"] = (last_seen - df["hour"]).dt.total_seconds() / 3600
    df["fails_soon"] = (df["hours_to_silence"] <= 24).astype(int)

    # Real-time-available features only: no peeking at the future.
    df["voltage_slope_6h"] = df.groupby("node")["voltage"].diff(6)
    df["voltage_slope_24h"] = df.groupby("node")["voltage"].diff(24)
    df["readings_rate"] = df["readings"] / df["readings"].max()

    features = ["voltage", "voltage_slope_6h", "voltage_slope_24h", "readings_rate"]
    df = df.dropna(subset=features)

    X = df[features]
    y = df["fails_soon"]

    if y.nunique() < 2:
        return {"trained": False, "reason": "single-class label"}

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    model = make_pipeline(
        StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced")
    )
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, proba)
    ap = average_precision_score(y_test, proba)
    base_rate = float(y.mean())

    coefs = model["logisticregression"].coef_[0]
    print(f"  ROC AUC {auc:.3f} · avg precision {ap:.3f} · base rate {base_rate:.1%}")

    return {
        "trained": True,
        "rocAuc": round(float(auc), 4),
        "averagePrecision": round(float(ap), 4),
        "baseRate": round(base_rate, 4),
        "trainSize": int(len(X_train)),
        "testSize": int(len(X_test)),
        "coefficients": [
            {"feature": f, "weight": round(float(c), 4)} for f, c in zip(features, coefs)
        ],
    }


def cluster_nodes(agg: pd.DataFrame, nodes: pd.DataFrame) -> pd.DataFrame:
    """Groups nodes by behavioural profile rather than by location."""
    print("Clustering node behaviour...")
    profile = (
        agg.groupby("node")
        .agg(
            temp_mean=("temperature", "mean"),
            temp_std=("temperature", "std"),
            humidity_mean=("humidity", "mean"),
            light_mean=("light", "mean"),
            voltage_min=("voltage", "min"),
            anomaly_rate=("is_anomaly", "mean"),
        )
        .dropna()
    )

    k = 4
    km = make_pipeline(StandardScaler(), KMeans(n_clusters=k, n_init=10, random_state=42))
    profile["cluster"] = km.fit_predict(profile)

    nodes = nodes.merge(
        profile[["cluster", "anomaly_rate"]], left_on="node", right_index=True, how="left"
    )
    print(f"  {k} clusters over {len(profile)} nodes")
    return nodes


def build_node_summary(agg: pd.DataFrame, locs: pd.DataFrame) -> pd.DataFrame:
    fleet_end = agg["hour"].max()

    summary = (
        agg.groupby("node")
        .agg(
            first_seen=("hour", "min"),
            last_seen=("hour", "max"),
            hours_reported=("hour", "nunique"),
            readings=("readings", "sum"),
            invalid_readings=("invalid_readings", "sum"),
            temp_mean=("temperature", "mean"),
            humidity_mean=("humidity", "mean"),
            voltage_last=("voltage", "last"),
            voltage_min=("voltage", "min"),
            anomalies=("is_anomaly", "sum"),
            mean_abs_deviation=("temp_deviation", lambda s: s.abs().mean()),
        )
        .reset_index()
    )

    span_hours = (
        (summary["last_seen"] - summary["first_seen"]).dt.total_seconds() / 3600
    ) + 1
    summary["coverage_pct"] = (summary["hours_reported"] / span_hours * 100).clip(upper=100)
    summary["hours_silent"] = (
        (fleet_end - summary["last_seen"]).dt.total_seconds() / 3600
    ).round()

    def status(row) -> str:
        if row["hours_silent"] >= 24:
            return "offline"
        if (
            row["voltage_last"] < VOLTAGE_CRITICAL
            or row["coverage_pct"] < 80
            or row["invalid_readings"] > 0
        ):
            return "degraded"
        return "healthy"

    summary["status"] = summary.apply(status, axis=1)
    summary = summary.merge(locs, on="node", how="left")
    return summary


def main() -> None:
    df = load_readings()
    df = flag_quality(df)

    agg = hourly_aggregate(df)
    agg = add_fleet_consensus(agg)
    agg = anomaly_detection(agg)

    drift = voltage_drift_model(agg)
    failure = failure_prediction(agg)

    locs = pd.read_csv(
        HERE / "mote_locs.txt", sep=r"\s+", header=None, names=["node", "x", "y"]
    )
    nodes = build_node_summary(agg, locs)
    nodes = cluster_nodes(agg, nodes)

    # --- Serialise ------------------------------------------------------

    print("Writing artifacts...")

    def col(s: pd.Series, digits: int) -> list:
        """Rounded column as a JSON-safe list, with NaN as null.

        Python's json module happily writes bare NaN, which is not valid JSON
        and blows up in the browser at fetch time. Everything goes through
        here, and the writer below refuses to emit NaN at all.
        """
        return [None if pd.isna(v) else round(float(v), digits) for v in s]

    nodes_out = [
        {
            "node": int(r["node"]),
            "x": None if pd.isna(r["x"]) else round(float(r["x"]), 2),
            "y": None if pd.isna(r["y"]) else round(float(r["y"]), 2),
            "status": r["status"],
            "cluster": None if pd.isna(r["cluster"]) else int(r["cluster"]),
            "firstSeen": r["first_seen"].isoformat(),
            "lastSeen": r["last_seen"].isoformat(),
            "hoursSilent": int(r["hours_silent"]),
            "hoursReported": int(r["hours_reported"]),
            "readings": int(r["readings"]),
            "invalidReadings": int(r["invalid_readings"]),
            "coveragePct": round(float(r["coverage_pct"]), 1),
            "tempMean": None if pd.isna(r["temp_mean"]) else round(float(r["temp_mean"]), 2),
            "humidityMean": None
            if pd.isna(r["humidity_mean"])
            else round(float(r["humidity_mean"]), 2),
            "voltageLast": None
            if pd.isna(r["voltage_last"])
            else round(float(r["voltage_last"]), 3),
            "voltageMin": None
            if pd.isna(r["voltage_min"])
            else round(float(r["voltage_min"]), 3),
            "anomalies": int(r["anomalies"]),
            "anomalyRate": None
            if pd.isna(r["anomaly_rate"])
            else round(float(r["anomaly_rate"]), 4),
            "meanAbsDeviation": None
            if pd.isna(r["mean_abs_deviation"])
            else round(float(r["mean_abs_deviation"]), 3),
        }
        for _, r in nodes.iterrows()
    ]

    # One canonical hour axis shared by the series and the fleet aggregates.
    # They used to be derived separately, which meant the same integer index
    # pointed at different hours in each — the dashboard's time control read
    # one and the node state read the other.
    hours = sorted(agg["hour"].unique())
    hour_index = {h: i for i, h in enumerate(hours)}

    # Every node-hour where the node transmitted anything, including hours
    # where every single reading was out of range.
    #
    # Dropping those made a node that is still broadcasting garbage look
    # identical to one that had gone silent, and by late March that is most of
    # the fleet: the batteries are failing, the radios still work. "Silent" and
    # "faulty" are different operational problems and the dashboard has to be
    # able to tell them apart.
    ts = agg.copy()
    ts["hour_idx"] = ts["hour"].map(hour_index)

    series = {
        "hours": [pd.Timestamp(h).isoformat() for h in hours],
        "node": ts["node"].astype(int).tolist(),
        "hourIdx": ts["hour_idx"].astype(int).tolist(),
        "temperature": col(ts["temperature"], 2),
        "humidity": col(ts["humidity"], 2),
        "light": col(ts["light"], 1),
        "voltage": col(ts["voltage"], 3),
        "tempDeviation": col(ts["temp_deviation"], 2),
        "anomaly": ts["is_anomaly"].astype(int).tolist(),
        "invalid": ts["invalid_readings"].astype(int).tolist(),
    }

    fleet_hourly = (
        agg.groupby("hour")
        .agg(
            temperature=("temperature", "median"),
            humidity=("humidity", "median"),
            active_nodes=("node", "nunique"),
            anomalies=("is_anomaly", "sum"),
        )
        .reindex(hours)  # same axis as the series, so indices line up
        .reset_index(names="hour")
    )

    # Nodes still producing usable measurements, as opposed to merely
    # transmitting. The gap between the two lines is the fleet degrading.
    usable = agg[agg["temperature"].notna() & (agg["voltage"] >= VOLTAGE_CRITICAL)]
    healthy_hourly = (
        usable.groupby("hour")["node"].nunique().reindex(hours).fillna(0).astype(int)
    )
    fleet_hourly["healthy_nodes"] = healthy_hourly.values

    fleet_hourly["active_nodes"] = fleet_hourly["active_nodes"].fillna(0).astype(int)
    fleet_hourly["anomalies"] = fleet_hourly["anomalies"].fillna(0).astype(int)

    meta = {
        "source": {
            "name": "Intel Berkeley Research Lab sensor deployment",
            "url": "http://db.csail.mit.edu/labdata/labdata.html",
            "nodes": int(agg["node"].nunique()),
            "rawReadings": int(len(df)),
            "period": {
                "from": agg["hour"].min().isoformat(),
                "to": agg["hour"].max().isoformat(),
            },
        },
        "quality": {
            "invalidReadings": int((~df["valid"]).sum()),
            "invalidPct": round(float((~df["valid"]).mean() * 100), 2),
            "invalidByCause": {
                "temperature": int((~df["temp_valid"]).sum()),
                "humidity": int((~df["humidity_valid"]).sum()),
                "voltage": int((~df["voltage_valid"]).sum()),
            },
            "tempRange": TEMP_RANGE,
            "humidityRange": HUMIDITY_RANGE,
            "voltageRange": VOLTAGE_RANGE,
        },
        "models": {"drift": drift, "failurePrediction": failure},
        "fleetHourly": {
            "hours": [pd.Timestamp(h).isoformat() for h in fleet_hourly["hour"]],
            "temperature": col(fleet_hourly["temperature"], 2),
            "humidity": col(fleet_hourly["humidity"], 2),
            "activeNodes": fleet_hourly["active_nodes"].astype(int).tolist(),
            "healthyNodes": fleet_hourly["healthy_nodes"].astype(int).tolist(),
            "anomalies": fleet_hourly["anomalies"].astype(int).tolist(),
        },
    }

    # allow_nan=False makes this fail loudly rather than write bare NaN, which
    # is not valid JSON and would only surface as a fetch error in the browser.
    for name, payload in [
        ("nodes.json", nodes_out),
        ("series.json", series),
        ("meta.json", meta),
    ]:
        (OUT / name).write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
        size = (OUT / name).stat().st_size
        print(f"  {name}: {size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
