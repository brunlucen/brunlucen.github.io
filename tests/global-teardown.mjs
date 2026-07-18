export default async function shutDownTestServer() {
  await Promise.all([4173, 4174].map(async (port) => {
    try {
      await fetch(`http://127.0.0.1:${port}/__portfolio_test_shutdown__`, {
        method: "POST",
        headers: { "X-Portfolio-Test-Token": "portfolio-playwright-server" }
      });
    } catch {
      // A server may already be gone after an interrupted or failed startup.
    }
  }));
}
