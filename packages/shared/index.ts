export const DEPLOYMENT_STATUSES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const WORKER_EVENTS = [
  "worker.register",
  "worker.heartbeat",
  "worker.job.accepted",
  "worker.stage.updated",
  "worker.log.appended",
  "worker.deployment.completed",
] as const;

export type WorkerEventType = (typeof WORKER_EVENTS)[number];

export type BuildProfile = {
  strategy: "NODE_MANAGED" | "DOCKERFILE";
  installCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  healthcheckPath?: string;
  port?: number;
  dockerContext?: string;
  dockerfilePath?: string;
  buildArgs?: Record<string, string>;
  command?: string[];
  timeoutSeconds: number;
  requiredSecretNames: string[];
  buildSecretNames?: string[];
};

export type DeploymentJob = {
  deploymentId: string;
  repositoryId: string;
  commitSha: string;
  targetWorkerId: string;
  profile: BuildProfile;
};

export type DeploymentEvent = {
  id: string;
  deploymentId: string;
  type: "deployment.status" | "stage.updated" | "log.appended" | "deployment.completed" | "stream.reset";
  sequence?: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type WorkerRegistration = {
  workerId: string;
  name: string;
  version: string;
  capabilities: { docker: boolean; maxConcurrency: number };
};

export const transitionAllowed = (from: DeploymentStatus, to: DeploymentStatus) => {
  const transitions: Record<DeploymentStatus, DeploymentStatus[]> = {
    QUEUED: ["RUNNING", "CANCELLED"],
    RUNNING: ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"],
    SUCCEEDED: [],
    FAILED: [],
    CANCELLED: [],
    TIMED_OUT: [],
  };
  return transitions[from].includes(to);
};
