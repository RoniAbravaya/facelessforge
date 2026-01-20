import React from 'react';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, addWeeks, subWeeks } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PostCard from '../post/PostCard';

export default function CalendarWeekView({ posts, selectedDate, onDateChange, onDeletePost }) {
  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getPostsForDate = (date) => {
    return posts.filter(post => 
      isSameDay(new Date(post.scheduled_for), date)
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onDateChange(subWeeks(selectedDate, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDateChange(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDateChange(addWeeks(selectedDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-4">
        {days.map((day, i) => {
          const dayPosts = getPostsForDate(day);
          const isToday = isSameDay(day, new Date());
          
          return (
            <div key={i} className="space-y-2">
              <div className={`text-center p-2 rounded ${isToday ? 'bg-blue-100 font-bold' : ''}`}>
                <div className="text-sm text-slate-600">{format(day, 'EEE')}</div>
                <div className="text-lg">{format(day, 'd')}</div>
              </div>
              <div className="space-y-2">
                {dayPosts.map(post => (
                  <PostCard key={post.id} post={post} compact onDelete={onDeletePost} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}