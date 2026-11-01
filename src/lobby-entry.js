import { requireLobbySession } from './lobby-access.js';
import './lobby-entry.css';

try {
  await requireLobbySession();
  // Reuse the game's asset bundle so the standalone download contains each model once.
  const destination = new URL(import.meta.env.DEV ? './game.html' : './nebeljagd.html', location.href);
  destination.searchParams.set('mode', 'lobby');
  const quality = new URLSearchParams(location.search).get('quality');
  if (quality === 'low' || quality === 'high') destination.searchParams.set('quality', quality);
  location.replace(destination.href);
} catch (error) {
  document.getElementById('lobbyStatus').textContent = error.message;
}
