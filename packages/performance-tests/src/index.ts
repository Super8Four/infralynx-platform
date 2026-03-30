export interface LoadScenarioThreshold {
  readonly maxP95Milliseconds: number;
  readonly minSuccessRate: number;
}

export interface LoadScenarioDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly fileName: string;
  readonly profile: "smoke" | "baseline";
  readonly threshold: LoadScenarioThreshold;
}

export const loadScenarioDefinitions: readonly LoadScenarioDefinition[] = [
  {
    id: "api-concurrency",
    title: "API concurrency validation",
    description: "Exercises hot read endpoints under concurrent request pressure.",
    fileName: "api-concurrency.yml",
    profile: "smoke",
    threshold: {
      maxP95Milliseconds: 900,
      minSuccessRate: 0.99
    }
  },
  {
    id: "job-engine-stress",
    title: "Job enqueue saturation",
    description: "Applies concurrent write pressure to the jobs API to expose queue bottlenecks.",
    fileName: "job-engine-stress.yml",
    profile: "baseline",
    threshold: {
      maxP95Milliseconds: 1400,
      minSuccessRate: 0.98
    }
  },
  {
    id: "concurrent-sessions",
    title: "Concurrent session handling",
    description: "Creates, refreshes, and reads sessions through the auth API.",
    fileName: "concurrent-sessions.yml",
    profile: "smoke",
    threshold: {
      maxP95Milliseconds: 1000,
      minSuccessRate: 0.99
    }
  }
] as const;

export function getLoadScenarios(profile: "smoke" | "baseline") {
  return loadScenarioDefinitions.filter((scenario) => {
    if (profile === "baseline") {
      return true;
    }

    return scenario.profile === "smoke";
  });
}

export function renderScenarioSummary() {
  return loadScenarioDefinitions.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    threshold: scenario.threshold
  }));
}
