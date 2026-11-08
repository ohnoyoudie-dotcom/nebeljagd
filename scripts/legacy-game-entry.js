/** Preserve bookmarked game URLs and editor playtest parameters after renaming.
 * One small redirect avoids embedding the whole game twice in the offline ZIP. */
export function legacyGameEntry() {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Magebrawl · Spiel öffnen</title></head>
<body><p>Magebrawl wird geöffnet … <a id="game-link" href="./magebrawl.html">Zum Spiel</a></p>
<script>
const target = new URL('./magebrawl.html', location.href);
target.search = location.search; target.hash = location.hash;
document.getElementById('game-link').href = target.href;
location.replace(target.href);
</script></body></html>`;
}
