export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setup } = await import("@leesuyeon/ssr-devtools/instrumentation");
    setup({ enabled: true });
  }
}
