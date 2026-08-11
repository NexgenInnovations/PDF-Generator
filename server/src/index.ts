import { app } from './app.js';
import { initDb } from './db.js';

await initDb();

const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});
