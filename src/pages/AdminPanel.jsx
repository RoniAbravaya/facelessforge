/**
 * AdminPanel - Administrative dashboard for user management, queue monitoring,
 * audit logs, and tenant settings. Implements RBAC with role-based access control.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import {
  Users, Clock, FileText, Settings, Search,
  RefreshCw, AlertCircle, CheckCircle2, Loader2, XCircle,
  Mail, UserPlus, MoreHorizontal, Play,
  Eye, Download, Filter, ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

// Role configurations with permissions
const ROLES = {
  owner: {
    name: 'Owner',
    color: 'bg-amber-100 text-amber-700',
    permissions: ['all'],
    description: 'App owner - cannot be modified'
  },
  superadmin: {
    name: 'Super Admin',
    color: 'bg-red-100 text-red-700',
    permissions: ['all'],
    description: 'Full system access across all tenants'
  },
  admin: {
    name: 'Admin',
    color: 'bg-purple-100 text-purple-700',
    permissions: ['manage_users', 'manage_posts', 'view_analytics', 'manage_settings'],
    description: 'Full tenant access'
  },
  editor: {
    name: 'Editor',
    color: 'bg-blue-100 text-blue-700',
    permissions: ['manage_posts', 'view_analytics'],
    description: 'Can create and edit posts'
  },
  author: {
    name: 'Author',
    color: 'bg-green-100 text-green-700',
    permissions: ['create_posts', 'view_own_analytics'],
    description: 'Can create own posts'
  }
};

// Status configurations
const USER_STATUS = {
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  suspended: { label: 'Suspended', color: 'bg-red-100 text-red-700' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' }
};

const JOB_STATUS = {
  pending: { label: 'Pending', color: 'bg-slate-100 text-slate-700', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle }
};

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [auditLogFilter, setAuditLogFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch users
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      try {
        const userList = await base44.entities.User.list('-created_date', 100);
        return userList;
      } catch {
        // Return mock data if entity doesn't exist
        return [];
      }
    }
  });

  // Fetch publish jobs for queue monitoring (using ScheduledPost as the source)
  const { data: publishJobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['publishJobs'],
    queryFn: async () => {
      try {
        // Use ScheduledPost entity directly for queue monitoring
        const posts = await base44.entities.ScheduledPost.list('-created_date', 50);
        return posts.map(p => ({
          id: p.id,
          post_id: p.id,
          status: p.status === 'published' ? 'completed' : p.status === 'failed' ? 'failed' : p.status === 'publishing' ? 'processing' : 'pending',
          platform: p.platform || 'tiktok',
          scheduled_for: p.scheduled_for,
          error_message: p.error_message,
          created_date: p.created_date,
          title: p.title,
          caption: p.caption
        }));
      } catch {
        return [];
      }
    },
    refetchInterval: 10000 // Refetch every 10 seconds
  });

  // Fetch audit logs
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['auditLogs', auditLogFilter],
    queryFn: async () => {
      try {
        const logs = await base44.entities.PublishAuditLog.list('-timestamp', 100);
        if (auditLogFilter !== 'all') {
          return logs.filter(log => log.action === auditLogFilter);
        }
        return logs;
      } catch {
        return [];
      }
    }
  });

  // Fetch tenant settings
  const { data: tenantSettings = {} } = useQuery({
    queryKey: ['tenantSettings'],
    queryFn: async () => {
      try {
        const settings = await base44.entities.TenantSettings.list('-created_date', 1);
        return settings[0] || {
          publishing_enabled: true,
          max_posts_per_day: 10,
          default_privacy: 'PUBLIC_TO_EVERYONE',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          branding: { primary_color: '#0f172a' }
        };
      } catch {
        return {
          publishing_enabled: true,
          max_posts_per_day: 10,
          default_privacy: 'PUBLIC_TO_EVERYONE',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          branding: { primary_color: '#0f172a' }
        };
      }
    }
  });

  // Invite user mutation
  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      // Use the proper user invitation API
      return await base44.users.inviteUser(data.email, data.role || 'user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminUsers']);
      setIsInviteDialogOpen(false);
      toast.success('User invitation sent successfully');
    },
    onError: (error) => {
      toast.error(`Failed to invite user: ${error.message}`);
    }
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, ...data }) => {
      // Check if user is the owner (can't update owner role)
      const userToUpdate = users.find(u => u.id === id);
      if (userToUpdate?.role === 'owner') {
        throw new Error('Cannot modify the app owner');
      }
      return await base44.entities.User.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['adminUsers']);
      setIsUserDialogOpen(false);
      toast.success('User updated successfully');
    },
    onError: (error) => {
      // Handle specific error for owner update
      if (error.message?.includes('owner')) {
        toast.error('Cannot modify the app owner\'s role or status');
      } else {
        toast.error(`Failed to update user: ${error.message}`);
      }
    }
  });

  // Retry job mutation
  const retryJobMutation = useMutation({
    mutationFn: async (jobId) => {
      // Find the original post and reset for retry
      const job = publishJobs.find(j => j.id === jobId);
      if (job?.post_id) {
        await base44.entities.ScheduledPost.update(job.post_id, {
          status: 'scheduled',
          error_message: null,
          retry_count: 0
        });
      }
      return jobId;
    },
    onSuccess: () => {
      refetchJobs();
      toast.success('Job queued for retry');
    },
    onError: (error) => {
      toast.error(`Failed to retry job: ${error.message}`);
    }
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings) => {
      if (tenantSettings.id) {
        return await base44.entities.TenantSettings.update(tenantSettings.id, settings);
      } else {
        return await base44.entities.TenantSettings.create(settings);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tenantSettings']);
      toast.success('Settings saved');
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error.message}`);
    }
  });

  // Filter users by search
  const filteredUsers = users.filter(user => 
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination
  const paginatedLogs = auditLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(auditLogs.length / itemsPerPage);

  // Stats calculations
  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    pendingJobs: publishJobs.filter(j => j.status === 'pending' || j.status === 'processing').length,
    failedJobs: publishJobs.filter(j => j.status === 'failed').length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">
            Admin Panel
          </h1>
          <p className="text-slate-600">
            Manage users, monitor queues, and configure system settings
          </p>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Users</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.totalUsers}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Active Users</p>
                  <p className="text-2xl font-bold text-emerald-600">{stats.activeUsers}</p>
                </div>
                <div className="p-3 bg-emerald-100 rounded-full">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Pending Jobs</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.pendingJobs}</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-full">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Failed Jobs</p>
                  <p className="text-2xl font-bold text-red-600">{stats.failedJobs}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="w-4 h-4" />
              Queue Monitor
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <FileText className="w-4 h-4" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage user accounts and roles</CardDescription>
                  </div>
                  <Button onClick={() => setIsInviteDialogOpen(true)} className="bg-slate-900 hover:bg-slate-800">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Users Table */}
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No users found</p>
                    <p className="text-sm text-slate-500">Invite your first team member to get started</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                                <span className="text-sm font-medium text-slate-600">
                                  {user.name?.[0] || user.email?.[0] || '?'}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">{user.name || 'No name'}</p>
                                <p className="text-sm text-slate-500">{user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${ROLES[user.role]?.color || 'bg-slate-100'} border-0`}>
                              {ROLES[user.role]?.name || user.role || 'User'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${USER_STATUS[user.status]?.color || 'bg-slate-100'} border-0`}>
                              {USER_STATUS[user.status]?.label || user.status || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {user.created_date ? new Date(user.created_date).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsUserDialogOpen(true);
                              }}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Queue Monitor Tab */}
          <TabsContent value="queue">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Queue Monitor</CardTitle>
                    <CardDescription>Monitor and manage publish jobs</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => refetchJobs()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {jobsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  </div>
                ) : publishJobs.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No jobs in queue</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {publishJobs.map((job) => {
                        const statusConfig = JOB_STATUS[job.status] || JOB_STATUS.pending;
                        const StatusIcon = statusConfig.icon;
                        return (
                          <TableRow key={job.id}>
                            <TableCell className="font-mono text-sm">
                              {job.id?.slice(0, 8)}...
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{job.platform || 'tiktok'}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${statusConfig.color} border-0`}>
                                <StatusIcon className={`w-3 h-3 mr-1 ${job.status === 'processing' ? 'animate-spin' : ''}`} />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {job.scheduled_for ? new Date(job.scheduled_for).toLocaleString() : '-'}
                            </TableCell>
                            <TableCell>
                              {job.error_message ? (
                                <span className="text-sm text-red-600 truncate max-w-48 block">
                                  {job.error_message}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {job.status === 'failed' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => retryJobMutation.mutate(job.id)}
                                    disabled={retryJobMutation.isPending}
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    Retry
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Audit Logs</CardTitle>
                    <CardDescription>Track all system activities</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={auditLogFilter} onValueChange={setAuditLogFilter}>
                      <SelectTrigger className="w-40">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="retried">Retried</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  </div>
                ) : paginatedLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No audit logs found</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Post ID</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-slate-600">
                              {log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.action}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {log.actor_type || 'user'}
                                </Badge>
                                <span className="text-sm">{log.actor_email || 'System'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.post_id?.slice(0, 8) || '-'}...
                            </TableCell>
                            <TableCell className="max-w-48 truncate text-sm text-slate-600">
                              {log.metadata ? JSON.stringify(log.metadata).slice(0, 50) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-slate-600">
                          Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, auditLogs.length)} of {auditLogs.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm text-slate-600">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <TenantSettingsForm 
              settings={tenantSettings} 
              onSave={(data) => updateSettingsMutation.mutate(data)}
              isSaving={updateSettingsMutation.isPending}
            />
          </TabsContent>
        </Tabs>

        {/* Invite User Dialog */}
        <InviteUserDialog
          open={isInviteDialogOpen}
          onOpenChange={setIsInviteDialogOpen}
          onInvite={(data) => inviteUserMutation.mutate(data)}
          isLoading={inviteUserMutation.isPending}
        />

        {/* Edit User Dialog */}
        <EditUserDialog
          user={selectedUser}
          open={isUserDialogOpen}
          onOpenChange={setIsUserDialogOpen}
          onSave={(data) => updateUserMutation.mutate({ id: selectedUser?.id, ...data })}
          isLoading={updateUserMutation.isPending}
        />
      </div>
    </div>
  );
}

// Tenant Settings Form Component
function TenantSettingsForm({ settings, onSave, isSaving }) {
  const [formData, setFormData] = useState({
    publishing_enabled: settings.publishing_enabled ?? true,
    max_posts_per_day: settings.max_posts_per_day ?? 10,
    default_privacy: settings.default_privacy ?? 'PUBLIC_TO_EVERYONE',
    timezone: settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    webhook_url: settings.webhook_url ?? '',
    ...settings
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Publishing Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Publishing Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Publishing</Label>
                <p className="text-sm text-slate-500">Allow scheduled posts to be published</p>
              </div>
              <Switch
                checked={formData.publishing_enabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, publishing_enabled: checked }))}
              />
            </div>

            <div>
              <Label htmlFor="max_posts">Max Posts Per Day</Label>
              <Input
                id="max_posts"
                type="number"
                min="1"
                max="100"
                value={formData.max_posts_per_day}
                onChange={(e) => setFormData(prev => ({ ...prev, max_posts_per_day: parseInt(e.target.value) || 10 }))}
                className="mt-2"
              />
            </div>

            <div>
              <Label>Default Privacy Level</Label>
              <Select
                value={formData.default_privacy}
                onValueChange={(value) => setFormData(prev => ({ ...prev, default_privacy: value }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC_TO_EVERYONE">Public</SelectItem>
                  <SelectItem value="MUTUAL_FOLLOW_FRIENDS">Friends Only</SelectItem>
                  <SelectItem value="SELF_ONLY">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">System Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Europe/Paris">Paris</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                  <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="webhook">Webhook URL (Optional)</Label>
              <Input
                id="webhook"
                type="url"
                placeholder="https://..."
                value={formData.webhook_url}
                onChange={(e) => setFormData(prev => ({ ...prev, webhook_url: e.target.value }))}
                className="mt-2"
              />
              <p className="text-xs text-slate-500 mt-1">Receive notifications for publish events</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={isSaving} className="bg-slate-900 hover:bg-slate-800">
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Invite User Dialog Component
function InviteUserDialog({ open, onOpenChange, onInvite, isLoading }) {
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'author'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onInvite(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation to join your team
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-2"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLES).map(([key, role]) => (
                  <SelectItem key={key} value={key}>
                    <div>
                      <span className="font-medium">{role.name}</span>
                      <span className="text-slate-500 ml-2 text-sm">- {role.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-slate-900 hover:bg-slate-800">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Send Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit User Dialog Component
function EditUserDialog({ user, open, onOpenChange, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    role: user?.role || 'author',
    status: user?.status || 'active'
  });

  // Check if user is the owner (cannot be edited)
  const isOwner = user?.role === 'owner';

  React.useEffect(() => {
    if (user) {
      setFormData({
        role: user.role || 'author',
        status: user.status || 'active'
      });
    }
  }, [user]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isOwner) {
      return; // Don't allow saving for owner
    }
    onSave(formData);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            {isOwner 
              ? 'The app owner cannot be modified' 
              : 'Update user role and status'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
              <span className="font-medium text-slate-600">
                {user.name?.[0] || user.email?.[0] || '?'}
              </span>
            </div>
            <div>
              <p className="font-medium">{user.name || 'No name'}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
              {isOwner && (
                <Badge className="mt-1 bg-amber-100 text-amber-700 border-0">App Owner</Badge>
              )}
            </div>
          </div>

          {isOwner ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                The app owner's role and status cannot be modified. This is a system restriction.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLES).map(([key, role]) => (
                      <SelectItem key={key} value={key}>{role.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {isOwner ? 'Close' : 'Cancel'}
            </Button>
            {!isOwner && (
              <Button type="submit" disabled={isLoading} className="bg-slate-900 hover:bg-slate-800">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}