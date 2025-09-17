export const onRequest: PagesFunction = async () => {
  const payload = {
    updatedAt: new Date().toISOString(),
    overall: "up",
    services: [],      // placeholder; we’ll replace with real data later
    incidents: []
  };
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" }
  });
};
