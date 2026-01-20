import React from 'react';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PostCard from '../post/PostCard';

export default function CalendarMonthView({ posts, selectedDate, onDateChange, onDeletePost }) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getPostsForDate = (date) => {
    return posts.filter(post => 
      isSameDay(new Date(post.scheduled_for), date)
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{format(selectedDate, 'MMMM yyyy')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onDateChange(subMonths(selectedDate, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDateChange(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDateChange(addMonths(selectedDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-sm font-semibold text-slate-600 py-2">
            {day}
          </div>
        ))}
        
        {days.map((day, i) => {
          const dayPosts = getPostsForDate(day);
          const isToday = isSameDay(day, new Date());
          
          return (
            <div
              key={i}
              className={`min-h-24 border rounded-lg p-2 ${
                !isSameMonth(day, selectedDate) ? 'bg-slate-50' :
                isToday ? 'border-blue-500 bg-blue-50' : 'bg-white'
              }`}
            >
              <div className="text-sm font-medium mb-1">{format(day, 'd')}</div>
              <div className="space-y-1">
                {dayPosts.slice(0, 2).map(post => (
                  <PostCard key={post.id} post={post} compact onDelete={onDeletePost} />
                ))}
                {dayPosts.length > 2 && (
                  <div className="text-xs text-slate-500">+{dayPosts.length - 2} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}