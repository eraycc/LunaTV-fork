import { NextRequest, NextResponse } from 'next/server';

// 标记为动态路由
export const dynamic = 'force-dynamic';

// 服务端专用函数，直接调用外部API
async function getRecommendedShortDramasInternal(
  category?: number,
  size = 10
) {
  const params = new URLSearchParams();
  if (category) params.append('category', category.toString());
  params.append('size', size.toString());

  const response = await fetch(
    `https://api.r2afosne.dpdns.org/vod/recommend?${params.toString()}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const items = data.items || [];
  return items.map((item: any) => ({
    id: item.vod_id || item.id,
    name: item.vod_name || item.name,
    cover: item.vod_pic || item.cover,
    update_time: item.vod_time || item.update_time || new Date().toISOString(),
    score: item.vod_score || item.score || 0,
    episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
    description: item.vod_content || item.description || '',
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const category = searchParams.get('category');
    const size = searchParams.get('size');

    const categoryNum = category ? parseInt(category) : undefined;
    const pageSize = size ? parseInt(size) : 10;

    if ((category && isNaN(categoryNum!)) || isNaN(pageSize)) {
      return NextResponse.json(
        { error: '参数格式错误' },
        { status: 400 }
      );
    }

    const result = await getRecommendedShortDramasInternal(categoryNum, pageSize);
    return NextResponse.json(result);
  } catch (error) {
    console.error('获取推荐短剧失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}