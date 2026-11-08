/** Accept existing hosting configuration while documenting the new brand. */
export function runtimeEnvironment(source = process.env) {
  const result = { ...source };
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('NEBELJAGD_')) continue;
    const replacement = key.replace('NEBELJAGD_', 'MAGEBRAWL_');
    if (result[replacement] === undefined) result[replacement] = value;
  }
  return result;
}
