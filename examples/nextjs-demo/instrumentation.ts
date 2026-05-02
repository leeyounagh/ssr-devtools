export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setup } = await import("@leeyounagh/ssr-devtools/instrumentation");
    setup({ enabled: true });
  }
}
