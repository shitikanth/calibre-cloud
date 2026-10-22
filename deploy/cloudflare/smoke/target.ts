type OutputEntry = { type?: string; targets?: string[] };

export function deployedOrigin(wranglerOutput: string): string {
  const deploys = wranglerOutput
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as OutputEntry)
    .filter((entry) => entry.type === 'deploy');

  const target = deploys.at(-1)?.targets?.find((t) => /\.workers\.dev(\/|$)/.test(t));
  if (!target) throw new Error('Wrangler output has no deploy entry with a workers.dev target');
  return new URL(target.includes('://') ? target : `https://${target}`).origin;
}
