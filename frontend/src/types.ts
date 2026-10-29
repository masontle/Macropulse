export type Model = "timesfm3" | "xgboost" | "persistence";
export type MarketRow = {
  date: string;
  close: number;
  adjusted_close: number;
  volume: number;
  log_return: number | null;
  rv5: number | null;
  rv21: number | null;
};
export type Score = {
  model: Model;
  regime: string;
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  improvement_pct: number | null;
  latency_ms: number;
  raw_mae: number;
  clipped_count: number;
};
export type Prediction = {
  origin: string;
  target_end: string;
  model: Model;
  prediction: number;
  actual: number;
  raw_prediction: number;
  regime: string;
  train_label_end: string | null;
};
export type Forecast = {
  value: number;
  raw_value: number;
  latency_ms: number;
  path: number[] | null;
  lower: number[] | null;
  upper: number[] | null;
};
export type ModelState = {
  status: string;
  reason?: string;
  device?: string;
  checkpoint?: string;
  checkpoint_revision?: string;
  load_ms?: number;
  latest_error?: string;
};
export type Research = {
  metadata: {
    run_id: string;
    created_at: string;
    test_first_origin: string;
    test_last_origin: string;
    test_origins: number;
    validation_origins: number;
    duration_seconds: number;
    seed: number;
    config: {
      context_length: number;
      origin_stride: number;
      refit_every: number;
      max_test_origins: number | null;
    };
    models: Record<Model, ModelState>;
    provenance: {
      source: string;
      retrieved_at: string;
      last_session: string;
      sha256: string;
      rows: number;
    };
    feature_importance: { feature: string; importance: number }[];
    pretraining_caveat: string;
  };
  metrics: Score[];
  forecasts: {
    origin: string;
    sessions: string[];
    generated_at: string;
    models: Partial<Record<Model, Forecast>>;
  };
};
