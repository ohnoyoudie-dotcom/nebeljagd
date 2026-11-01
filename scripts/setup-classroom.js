import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { saveTeacherPassword } from '../server/classroom.js';

async function hiddenQuestion(prompt) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Bitte dieses Kommando in einem interaktiven Terminal ausführen.');
  stdout.write(prompt);
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolveAnswer, reject) => {
    let answer = '';
    const finish = (error) => {
      stdin.removeListener('data', receive); stdin.setRawMode(false); stdin.pause(); stdout.write('\n');
      error ? reject(error) : resolveAnswer(answer);
    };
    const receive = input => {
      for (const char of input) {
        if (char === '\u0003') return finish(new Error('Einrichtung abgebrochen.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') answer = answer.slice(0, -1);
        else if (char >= ' ' && answer.length < 256) answer += char;
      }
    };
    stdin.on('data', receive);
  });
}

try {
  const first = await hiddenQuestion('Neues Lehrkraft-Passwort (mindestens 12 Zeichen, Eingabe unsichtbar): ');
  const second = await hiddenQuestion('Passwort wiederholen: ');
  if (first !== second) throw new Error('Die Passwörter stimmen nicht überein.');
  await saveTeacherPassword(resolve(process.env.NEBELJAGD_DATA_DIR || '.nebeljagd'), first, { replace: process.argv.includes('--replace') });
  console.log('Lehrkraft-Zugang eingerichtet. Das Passwort wurde ausschließlich als gesalzener Hash gespeichert.');
  if (process.argv.includes('--replace')) console.log('Bitte den Schulserver neu starten, um bestehende Anmeldungen zu beenden.');
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Ein Lehrkraft-Zugang existiert bereits. Für einen bewussten Wechsel --replace verwenden und den Server neu starten.' : error.message);
  process.exitCode = 1;
}
