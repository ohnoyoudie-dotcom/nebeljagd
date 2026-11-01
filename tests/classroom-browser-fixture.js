// Private, disposable backend for classroom_smoke.py. Read the generated
// credential from stdin: never from a command argument or a production file.
import { createClassroomServer, saveTeacherPassword } from '../server/classroom.js';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { password, dataDir, publicDir, port } = JSON.parse(input);
await saveTeacherPassword(dataDir, password);
input = '';
const server = await createClassroomServer({ dataDir, publicDir });
server.on('error', () => {
  console.error('Disposable classroom server failed to start.');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, url: `http://127.0.0.1:${server.address().port}` }));
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
