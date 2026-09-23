const baseUrl = process.env.API_BASE_URL ?? "http://localhost:5000";
const userId = process.argv[2] ?? "U001";
const questions = [
  "What is my total portfolio value?",
  "Show my retail properties.",
  "What if I exclude the Bandra property?",
];
let conversationId;
const measurements = [];
for (const question of questions) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, conversationId, message: question }),
  });
  const body = await response.json();
  if (!response.ok || body.message?.includes("could not complete"))
    throw new Error(JSON.stringify(body));
  conversationId = body.conversationId;
  measurements.push({
    question,
    elapsedMs: Math.round(performance.now() - started),
  });
}
const sorted = measurements.map((m) => m.elapsedMs).sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      userId,
      conversationId,
      samples: measurements,
      medianMs: sorted[1],
      maxMs: sorted[2],
    },
    null,
    2,
  ),
);
