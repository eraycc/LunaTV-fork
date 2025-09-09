import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// YouTube Data API v3 配置
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// 模拟搜索数据（当没有真实API Key时使用）
const mockSearchResults = [
  {
    id: { videoId: 'dQw4w9WgXcQ' },
    snippet: {
      title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
      description: 'The official video for "Never Gonna Give You Up" by Rick Astley',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'Rick Astley',
      publishedAt: '2009-10-25T06:57:33Z',
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw'
    }
  },
  {
    id: { videoId: '9bZkp7q19f0' },
    snippet: {
      title: 'PSY - GANGNAM STYLE(강남스타일) M/V',
      description: 'PSY - GANGNAM STYLE(강남스타일) M/V',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/9bZkp7q19f0/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'officialpsy',
      publishedAt: '2012-07-15T08:34:21Z',
      channelId: 'UCrDkAvF9ZRMyvALrOFqOZ5A'
    }
  },
  {
    id: { videoId: 'kJQP7kiw5Fk' },
    snippet: {
      title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
      description: 'Luis Fonsi - Despacito ft. Daddy Yankee',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'LuisFonsiVEVO',
      publishedAt: '2017-01-12T19:06:32Z',
      channelId: 'UCAxjGjCSj8wLGhcMQTKgxNw'
    }
  },
  {
    id: { videoId: 'fJ9rUzIMcZQ' },
    snippet: {
      title: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
      description: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'Queen Official',
      publishedAt: '2008-08-01T14:54:09Z',
      channelId: 'UCwK2Grm574W1u-sBzLikldQ'
    }
  }
];

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  
  if (!query) {
    return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
  }

  try {
    // 获取YouTube配置
    const config = await getConfig();
    const youtubeConfig = config.YouTubeConfig;

    // 检查YouTube功能是否启用
    if (!youtubeConfig?.enabled) {
      return NextResponse.json({
        success: false,
        error: 'YouTube搜索功能未启用'
      }, { 
        status: 400,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Expires': '0',
          'Pragma': 'no-cache',
          'Surrogate-Control': 'no-store'
        }
      });
    }

    const maxResults = Math.min(parseInt(searchParams.get('maxResults') || String(youtubeConfig.maxResults || 25)), 50);

    // YouTube搜索缓存：60分钟（因为YouTube内容更新频率相对较低）
    const YOUTUBE_CACHE_TIME = 60 * 60; // 60分钟（秒）
    const enabledRegionsStr = (youtubeConfig.enabledRegions || []).sort().join(',');
    const enabledCategoriesStr = (youtubeConfig.enabledCategories || []).sort().join(',');
    // 缓存key包含功能状态、演示模式、最大结果数，确保配置变化时缓存隔离
    const cacheKey = `youtube-search-${youtubeConfig.enabled}-${youtubeConfig.enableDemo}-${maxResults}-${query}-${enabledRegionsStr}-${enabledCategoriesStr}`;
    
    console.log(`🔍 检查YouTube搜索缓存: ${cacheKey}`);
    
    // 服务端直接调用数据库（不用ClientCache，避免HTTP循环调用）
    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ YouTube搜索缓存命中(数据库): "${query}"`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString()
        });
      }
      
      console.log(`❌ YouTube搜索缓存未命中: "${query}"`);
    } catch (cacheError) {
      console.warn('YouTube搜索缓存读取失败:', cacheError);
      // 缓存失败不影响主流程，继续执行
    }

    // 如果启用演示模式或没有配置API Key，返回模拟数据
    if (youtubeConfig.enableDemo || !youtubeConfig.apiKey) {
      const filteredResults = mockSearchResults.slice(0, maxResults).map(video => ({
        ...video,
        snippet: {
          ...video.snippet,
          title: `${query} - ${video.snippet.title}`, // 模拟搜索匹配
        }
      }));
      
      const responseData = {
        success: true,
        videos: filteredResults,
        total: filteredResults.length,
        query: query,
        source: 'demo'
      };

      // 服务端直接保存到数据库（不用ClientCache，避免HTTP循环调用）
      try {
        await db.setCache(cacheKey, responseData, YOUTUBE_CACHE_TIME);
        console.log(`💾 YouTube搜索演示结果已缓存(数据库): "${query}" - ${responseData.videos.length} 个结果, TTL: ${YOUTUBE_CACHE_TIME}s`);
      } catch (cacheError) {
        console.warn('YouTube搜索缓存保存失败:', cacheError);
      }
      
      return NextResponse.json(responseData);
    }

    // 使用真实的YouTube API
    const searchUrl = `${YOUTUBE_API_BASE}/search?` +
      `key=${youtubeConfig.apiKey}&` +
      `q=${encodeURIComponent(query)}&` +
      `part=snippet&` +
      `type=video&` +
      `maxResults=${maxResults}&` +
      `order=relevance`;

    const response = await fetch(searchUrl);

    if (!response.ok) {
      throw new Error(`YouTube API请求失败: ${response.status}`);
    }

    const data = await response.json();
    
    const responseData = {
      success: true,
      videos: data.items || [],
      total: data.pageInfo?.totalResults || 0,
      query: query,
      source: 'youtube'
    };

    // 服务端直接保存到数据库（不用ClientCache，避免HTTP循环调用）
    try {
      await db.setCache(cacheKey, responseData, YOUTUBE_CACHE_TIME);
      console.log(`💾 YouTube搜索API结果已缓存(数据库): "${query}" - ${responseData.videos.length} 个结果, TTL: ${YOUTUBE_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('YouTube搜索缓存保存失败:', cacheError);
    }

    console.log(`✅ YouTube搜索完成: "${query}" - ${responseData.videos.length} 个结果`);
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('YouTube搜索失败:', error);
    
    // API失败时返回模拟数据作为备用
    const fallbackResults = mockSearchResults.slice(0, 10).map(video => ({
      ...video,
      snippet: {
        ...video.snippet,
        title: `${query} - ${video.snippet.title}`,
      }
    }));
    
    const fallbackData = {
      success: true,
      videos: fallbackResults,
      total: fallbackResults.length,
      query: query,
      source: 'fallback'
    };

    // 失败情况的缓存时间设短一点，避免长时间缓存错误状态
    try {
      // 在catch块中重新构建简化的cacheKey
      const fallbackCacheKey = `youtube-search-fallback-${query}`;
      await db.setCache(fallbackCacheKey, fallbackData, 5 * 60); // 5分钟
      console.log(`💾 YouTube搜索备用结果已缓存(数据库): "${query}" - ${fallbackData.videos.length} 个结果, TTL: 5分钟`);
    } catch (cacheError) {
      console.warn('YouTube搜索备用缓存保存失败:', cacheError);
    }
    
    return NextResponse.json(fallbackData);
  }
}