import React from 'react';
import { format } from 'date-fns';
import PostCard from '../post/PostCard';

export default function PostListView({ posts, onDeletePost }) {
  const sortedPosts = [...posts].sort((a, b) => 
    new Date(b.scheduled_for) - new Date(a.scheduled_for)
  );

  const groupedPosts = sortedPosts.reduce((acc, post) => {
    const dateKey = format(new Date(post.scheduled_for), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(post);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groupedPosts).map(([date, datePosts]) => (
        <div key={date}>
          <h3 className="text-lg font-semibold mb-3 sticky top-0 bg-white py-2">
            {format(new Date(date), 'EEEE, MMMM d, yyyy')}
          </h3>
          <div className="space-y-2">
            {datePosts.map(post => (
              <PostCard key={post.id} post={post} onDelete={onDeletePost} />
            ))}
          </div>
        </div>
      ))}
      
      {posts.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          No scheduled posts yet. Create your first post to get started!
        </div>
      )}
    </div>
  );
}