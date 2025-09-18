import express from 'express';

const app = express();
app.use(express.json());

// Sample routes for testing API detection
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/users', (req, res) => {
  res.json([{ id: 1, name: 'John' }]);
});

app.post('/users', (req, res) => {
  res.status(201).json({ id: 2, name: req.body.name });
});

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'John' });
});

app.put('/users/:id', (req, res) => {
  res.json({ id: req.params.id, name: req.body.name });
});

app.delete('/users/:id', (req, res) => {
  res.status(204).send();
});

// Router example
const router = express.Router();
router.get('/profile', (req, res) => {
  res.json({ profile: 'data' });
});

router.post('/settings', (req, res) => {
  res.json({ settings: 'updated' });
});

app.use('/api', router);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;