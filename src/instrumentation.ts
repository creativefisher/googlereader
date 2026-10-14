export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_FEED_SCHEDULER !== "true") {
    const { startRefreshScheduler } = await import("@/lib/jobs/refresh-scheduler");
    startRefreshScheduler();
  }
}
