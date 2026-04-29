# Trending Content Engine POC

This project is a Proof of Concept (POC) for a trending content engine using Node.js, Express, TypeScript, and Redis Stack. It implements real-time analytics for content interaction using memory-efficient Redis data structures.

## Data Structures Used

This project leverages advanced probabilistic data structures provided by Redis Stack to handle high volumes of interaction data efficiently:

1. **Count-Min Sketch (CMS)**: 
   - **Purpose**: Used for tracking approximate interaction counts (likes, views, etc.) for posts.
   - **Benefit**: Extremely memory efficient. Instead of storing exact counters for millions of items, it uses a bounded amount of memory to provide a highly accurate approximation of event frequencies.

2. **HyperLogLog (HLL)**:
   - **Purpose**: Used for tracking the number of unique viewers for a post.
   - **Benefit**: Provides an approximate count of unique elements with a standard error of ~0.81%. It allows us to distinguish between a few users spamming views versus an actual viral post with millions of unique viewers, using only a tiny fraction of memory (~12 KB per key) regardless of the number of elements.

3. **Bloom Filters (BF)**:
   - **Purpose**: Used for managing user exposure to content (tracking which posts a user has already seen).
   - **Benefit**: A fast, space-efficient probabilistic data structure that can quickly answer if an item definitely *has not* been seen, or *possibly has* been seen. Perfect for feeding diverse, unseen content to users without storing massive lists of post IDs per user.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) (v16 or higher recommended)
- [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose (for running Redis Stack)

## Setup and Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start Redis Stack**:
   The project requires Redis Stack to support advanced data structures (CMS, BF). Start it using Docker Compose:
   ```bash
   docker-compose up -d
   ```
   *Note: Redis will be available on port `6380` and RedisInsight UI on port `8002`.*

## Running the Project

**Start the development server**:
```bash
npm run dev
```

The Express server will start on `http://localhost:3000`.

## Testing the APIs

You can interact with and test the APIs using the automatically generated Swagger Documentation. 

Once the server is running, navigate to:
**[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**

This UI will allow you to explore all endpoints, view their expected request payloads, and test recording interactions and fetching analytics data.

### Available Endpoints
- `POST /api/interact`: Record an interaction (updates CMS, HLL, and Bloom Filter).
- `GET /api/insights/trending/{postId}`: Get approximate interaction count using Count-Min Sketch.
- `GET /api/insights/unique-viewers/{postId}`: Get unique viewer count using HyperLogLog.
- `GET /api/insights/exposure/{userId}/{postId}`: Check if a user has already seen a post using the Bloom Filter.