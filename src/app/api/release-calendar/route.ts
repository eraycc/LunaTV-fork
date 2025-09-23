/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getReleaseCalendar, getFilters } from '@/lib/release-calendar-scraper';
import { ReleaseCalendarResult } from '@/lib/types';

export const runtime = 'nodejs';

// 缓存管理
let cacheData: ReleaseCalendarResult | null = null;
let cacheTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存（影视发布数据更新不频繁）


export async function GET(request: NextRequest) {
  // 检查用户认证
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    // 获取查询参数
    const type = searchParams.get('type') as 'movie' | 'tv' | null;
    const region = searchParams.get('region');
    const genre = searchParams.get('genre');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const offset = parseInt(searchParams.get('offset') || '0');
    const refresh = searchParams.get('refresh') === 'true' || searchParams.has('nocache');

    // 参数验证
    if (type && !['movie', 'tv'].includes(type)) {
      return NextResponse.json(
        { error: 'type 参数必须是 movie 或 tv' },
        { status: 400 }
      );
    }

    // 移除limit限制，因为实际数据量只有65个项目
    if (offset < 0) {
      return NextResponse.json(
        { error: 'offset 不能为负数' },
        { status: 400 }
      );
    }

    // 检查缓存（除非强制刷新）
    const now = Date.now();
    if (!refresh && cacheData && (now - cacheTime) < CACHE_DURATION) {
      console.log('使用缓存的发布日历数据');

      // 从缓存中应用过滤和分页
      let filteredItems = cacheData.items;

      if (type) {
        filteredItems = filteredItems.filter(item => item.type === type);
      }

      if (region && region !== '全部') {
        filteredItems = filteredItems.filter(item =>
          item.region.includes(region)
        );
      }

      if (genre && genre !== '全部') {
        filteredItems = filteredItems.filter(item =>
          item.genre.includes(genre)
        );
      }

      if (dateFrom) {
        filteredItems = filteredItems.filter(item =>
          item.releaseDate >= dateFrom
        );
      }

      if (dateTo) {
        filteredItems = filteredItems.filter(item =>
          item.releaseDate <= dateTo
        );
      }

      const total = filteredItems.length;
      const items = limit ? filteredItems.slice(offset, offset + limit) : filteredItems.slice(offset);
      const hasMore = limit ? offset + limit < total : false;

      return NextResponse.json({
      items,
      total,
      hasMore,
      filters: cacheData.filters,
    });
    }

    console.log('获取新的发布日历数据...');

    // 获取数据和过滤器
    const [calendarData, filters] = await Promise.all([
      getReleaseCalendar({
        type: type || undefined,
        region: region || undefined,
        genre: genre || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset,
      }),
      getFilters(),
    ]);

    const result: ReleaseCalendarResult = {
      items: calendarData.items,
      total: calendarData.total,
      hasMore: calendarData.hasMore,
      filters,
    };

    // 更新缓存（仅在无过滤条件时）
    if (!type && !region && !genre && !dateFrom && !dateTo && offset === 0) {
      const allData = await getReleaseCalendar({});
      cacheData = {
        items: allData.items,
        total: allData.total,
        hasMore: allData.hasMore,
        filters,
      };
      cacheTime = now;
      console.log(`发布日历缓存已更新，包含 ${allData.items.length} 项`);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('获取发布日历失败:', error);
    return NextResponse.json(
      {
        error: '获取发布日历失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// 手动刷新缓存的API
export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('手动刷新发布日历缓存...');

    // 清除缓存
    cacheData = null;
    cacheTime = 0;

    // 重新获取数据
    const [calendarData, filters] = await Promise.all([
      getReleaseCalendar({}),
      getFilters(),
    ]);

    // 更新缓存
    cacheData = {
      items: calendarData.items,
      total: calendarData.total,
      hasMore: calendarData.hasMore,
      filters,
    };
    cacheTime = Date.now();

    console.log(`发布日历缓存刷新完成，包含 ${calendarData.items.length} 项`);

    return NextResponse.json({
      success: true,
      message: '发布日历缓存已刷新',
      itemCount: calendarData.items.length,
    });
  } catch (error) {
    console.error('刷新发布日历缓存失败:', error);
    return NextResponse.json(
      {
        error: '刷新发布日历缓存失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}