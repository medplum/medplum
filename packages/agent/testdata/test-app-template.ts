import { createPidFile, registerAgentCleanup } from '../src/pid';

process.on('disconnect', () => {
  console.log('Parent process has disconnected');
  process.exit(0);
});

try {
  const pidFilePath = createPidFile('$___APP_NAME___$');
  registerAgentCleanup(pidFilePath);
  console.log(`Test app running with PID: ${process.pid}`);
  console.log(`PID file created at: ${pidFilePath}`);
  process?.send?.('READY');
} catch (err) {
  console.error('Failed to create PID file, another instance may be running');
  console.error(err);
  process.exit(1);
}
