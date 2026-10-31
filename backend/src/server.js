import 'dotenv/config';

const { createApp } = await import('./app.js');
const PORT = process.env.PORT || 8080;
console.log(`Starting server on port ${PORT}`);
const server = createApp().listen(PORT);
server.once('listening', () => {
  console.log(`Server running on port ${PORT}`);
});
server.once('error', error => {
  console.error('Server failed to start:', error);
  process.exitCode = 1;
});
