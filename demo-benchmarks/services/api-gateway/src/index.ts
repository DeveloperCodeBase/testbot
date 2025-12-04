import express from 'express';
import axios from 'axios';

const app = express();
const port = 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.get('/users', (_req, res) => {
    res.json([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
});

app.post('/users', (req, res) => {
    const user = req.body;
    res.status(201).json({ ...user, id: Math.floor(Math.random() * 1000) });
});

app.get('/analytics/summary', async (_req, res) => {
    try {
        // Call python service (mocked URL for now, or localhost:8000)
        // In a real env, this would be an env var
        const response = await axios.get('http://localhost:8000/stats/users');
        res.json({ summary: response.data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`API Gateway listening at http://localhost:${port}`);
    });
}

export default app;
