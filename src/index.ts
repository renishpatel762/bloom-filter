import express, { Request, Response } from 'express';
import { redisClient, initRedis } from './redisClient';
import { setupSwagger } from './swagger';

const app = express();
app.use(express.json());
setupSwagger(app);

const PORT = process.env.PORT || 3000;

/**
 * @openapi
 * /api/interact:
 *   post:
 *     summary: Record an interaction (adds to CMS, HLL, and BF)
 *     description: Tracks a user's interaction with a post. It updates the Count-Min Sketch (interaction count), HyperLogLog (unique viewers), and Bloom Filter (user exposure).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - postId
 *               - action
 *             properties:
 *               userId:
 *                 type: string
 *               postId:
 *                 type: string
 *               action:
 *                 type: string
 *     responses:
 *       200:
 *         description: Interaction recorded successfully
 *       400:
 *         description: Missing userId, postId, or action
 *       500:
 *         description: Internal Server Error
 */
// 1. POST /api/interact
// Record an interaction (adds to CMS, HLL, and BF)
app.post('/api/interact', async (req: Request, res: Response) => {
  const { userId, postId, action } = req.body;

  if (!userId || !postId || !action) {
    return res.status(400).json({ error: 'Missing userId, postId, or action' });
  }

  try {
    // A) HyperLogLog: Track unique viewers for this post
    // PFADD returns 1 if the item was added, 0 if it already existed
    await redisClient.pfAdd(`post:${postId}:unique_viewers`, userId);

    // B) Count-Min Sketch: Increment interaction count
    // CMS.INCRBY returns an array of current counts for the given items
    await redisClient.sendCommand(['CMS.INCRBY', 'interactions', postId, '1']);

    // C) Bloom Filter: Track if user has been exposed to this post
    // Initialize BF if it doesn't exist (we can just use BF.ADD which creates it with default settings if it doesn't exist)
    await redisClient.sendCommand(['BF.ADD', `user:${userId}:exposure`, postId]);

    res.status(200).json({ success: true, message: 'Interaction recorded successfully' });
  } catch (error) {
    console.error('Error recording interaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @openapi
 * /api/insights/trending/{postId}:
 *   get:
 *     summary: Get approximate interaction count using Count-Min Sketch
 *     description: Returns the approximate number of interactions for a specific post.
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the post
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 postId:
 *                   type: string
 *                 approximateInteractions:
 *                   type: integer
 *       500:
 *         description: Internal Server Error
 */
// 2. GET /api/insights/trending/:postId
// Get approximate interaction count using Count-Min Sketch
app.get('/api/insights/trending/:postId', async (req: Request, res: Response) => {
  const { postId } = req.params;
  try {
    // CMS.QUERY returns an array of counts. Since we query 1 item, it's at index 0
    const counts = await redisClient.sendCommand(['CMS.QUERY', 'interactions', postId]);
    const approximateCount = Array.isArray(counts) ? counts[0] : counts;
    res.status(200).json({ postId, approximateInteractions: approximateCount });
  } catch (error) {
    console.error('Error fetching trending count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @openapi
 * /api/insights/unique-viewers/{postId}:
 *   get:
 *     summary: Get unique viewer count using HyperLogLog
 *     description: Returns the approximate number of unique users who viewed a specific post.
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the post
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 postId:
 *                   type: string
 *                 uniqueViewers:
 *                   type: integer
 *       500:
 *         description: Internal Server Error
 */
// 3. GET /api/insights/unique-viewers/:postId
// Get unique viewer count using HyperLogLog
app.get('/api/insights/unique-viewers/:postId', async (req: Request, res: Response) => {
  const { postId } = req.params;
  try {
    // PFCOUNT returns the approximate number of unique elements
    const uniqueCount = await redisClient.pfCount(`post:${postId}:unique_viewers`);
    res.status(200).json({ postId, uniqueViewers: uniqueCount });
  } catch (error) {
    console.error('Error fetching unique viewers:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @openapi
 * /api/insights/exposure/{userId}/{postId}:
 *   get:
 *     summary: Check if user has already seen a post using Bloom Filter
 *     description: Returns whether a specific user has been exposed to a specific post.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the post
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 postId:
 *                   type: string
 *                 hasSeen:
 *                   type: boolean
 *       500:
 *         description: Internal Server Error
 */
// 4. GET /api/insights/exposure/:userId/:postId
// Check if user has already seen a post using Bloom Filter
app.get('/api/insights/exposure/:userId/:postId', async (req: Request, res: Response) => {
  const { userId, postId } = req.params;
  try {
    // BF.EXISTS returns 1 if item *may* exist, 0 if it definitely does not exist
    const exists = await redisClient.sendCommand(['BF.EXISTS', `user:${userId}:exposure`, postId]);
    const hasSeen = exists === 1;
    res.status(200).json({ userId, postId, hasSeen });
  } catch (error) {
    // If the Bloom Filter doesn't exist yet, it will throw an error 'ERR not found'
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(200).json({ userId, postId, hasSeen: false });
    }
    console.error('Error checking exposure:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start Server
const startServer = async () => {
  await initRedis();
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

startServer();
