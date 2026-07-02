/**
 * YouTube 数据源路由
 * GET /api/youtube — 返回最新 BCI 相关 YouTube 视频
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const { searchVideos, isAvailable } = require('../services/youtube');

router.get('/youtube', requireRole('owner', 'operator'), async (req, res) => {
    if (!isAvailable()) {
        return res.json([]); // 无 API Key 时返回空数组
    }

    try {
        // 默认获取最近 7 天的视频
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
        const videos = await searchVideos({
            maxResults: 10,
            publishedAfter: oneWeekAgo,
        });
        res.json(videos);
    } catch (err) {
        console.error('YouTube route error:', err.message);
        res.json([]);
    }
});

module.exports = router;
