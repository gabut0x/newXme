import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import TopupModal from '@/components/TopupModal';
import { useAuth, DashboardNotification } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useNotifications } from '@/hooks/useNotifications';
import { apiService, DashboardData, WindowsVersion, InstallData } from '@/services/api';
import {
  Code,
  User,
  Settings,
  LogOut,
  Plus,
  Server,
  Activity,
  TrendingUp,
  Coins,
  Bell,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Monitor,
  Wifi,
  HardDrive,
  BarChart3,
  RefreshCw
} from 'lucide-react';

const installSchema = z.object({
  ip: z.string()
    .min(1, 'IP address is required')
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address'),
  passwd_vps: z.string().min(1, 'VPS password is required'),
  win_ver: z.string().min(1, 'Windows version is required'),
  passwd_rdp: z.string()
    .min(4, 'RDP password must be at least 4 characters')
    .refine((password) => !password.startsWith('#'), {
      message: 'RDP password cannot start with "#" character'
    }),
});

type InstallFormData = z.infer<typeof installSchema>;

export default function UserDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [windowsVersions, setWindowsVersions] = useState<WindowsVersion[]>([]);
  const [installHistory, setInstallHistory] = useState<InstallData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showRdpPassword, setShowRdpPassword] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const { state, logout } = useAuth();
  const { toast } = useToast();
  const { notifications } = useNotifications();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InstallFormData>({
    resolver: zodResolver(installSchema),
  });

  // Update unread count when notifications change
  useEffect(() => {
    setUnreadCount(notifications.length);
  }, [notifications]);

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      const [dashboardResponse, versionsResponse, historyResponse] = await Promise.all([
        apiService.getDashboard(),
        apiService.getWindowsVersions(),
        apiService.getInstallHistory()
      ]);

      if (dashboardResponse.data.success) {
        setDashboardData(dashboardResponse.data.data);
      }

      if (versionsResponse.data.success) {
        setWindowsVersions(versionsResponse.data.data || []);
      }

      if (historyResponse.data.success) {
        setInstallHistory(historyResponse.data.data || []);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading dashboard',
        description: error.response?.data?.message || 'Failed to load dashboard data',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const onInstallSubmit = async (data: InstallFormData) => {
    setIsInstalling(true);
    try {
      const response = await apiService.createInstall(data);
      
      if (response.data.success) {
        toast({
          title: 'Installation started',
          description: 'Windows installation has been initiated. You will be notified when it completes.',
        });
        
        // Reset form and reload data
        reset();
        await loadDashboardData();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Installation failed',
        description: error.response?.data?.message || 'Failed to start installation',
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Activity className="w-3 h-3 mr-1" />
          Running
        </Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>;
      case 'failed':
        return <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>;
      case 'cancelled':
        return <Badge variant="secondary">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </Badge>;
      case 'manual_review':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Manual Review
        </Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-screen">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load dashboard data. Please refresh the page.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="octra-header">
        <div className="app-container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Code className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">XME Projects</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Notifications Bell */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              
              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-background border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Notifications</h3>
                    <p className="text-sm text-muted-foreground">{notifications.length} new notifications</p>
                  </div>
                  
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No new notifications</p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.map((notification, index) => (
                        <div key={index} className="p-4 border-b last:border-b-0 hover:bg-muted/50">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              {notification.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                              {notification.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                              {notification.status === 'running' && <Activity className="h-4 w-4 text-blue-500" />}
                              {notification.status === 'pending' && <Clock className="h-4 w-4 text-yellow-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{notification.message}</p>
                              {notification.ip && (
                                <p className="text-xs text-muted-foreground">IP: {notification.ip}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {new Date(notification.timestamp).toLocaleString('id-ID', {
                                  timeZone: 'Asia/Jakarta',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: 'numeric',
                                  month: 'short'
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <ThemeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={dashboardData.user.profile?.avatar_url} />
                    <AvatarFallback>
                      {dashboardData.user.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{dashboardData.user.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Welcome back, {dashboardData.user.profile?.first_name || dashboardData.user.username}!
          </h1>
          <p className="text-muted-foreground">
            Manage your VPS installations and monitor your Windows environments
          </p>
        </div>

        {/* Email Verification Alert */}
        {!dashboardData.user.is_verified && (
          <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              Please verify your email address to access all features.{' '}
              <Button variant="link" className="p-0 h-auto text-yellow-800 dark:text-yellow-200" asChild>
                <Link to="/verify-email">Verify now</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total VPS</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.stats.totalVPS}</div>
              <p className="text-xs text-muted-foreground">
                All installations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Installations</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.stats.activeConnections}</div>
              <p className="text-xs text-muted-foreground">
                Currently running
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.stats.successRate}</div>
              <p className="text-xs text-muted-foreground">
                {dashboardData.stats.completedInstalls} of {dashboardData.stats.totalVPS} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Quota</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.stats.quota}</div>
              <p className="text-xs text-muted-foreground">
                Installations remaining
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="install">Install Windows</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>
                    Common tasks and operations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    onClick={() => setShowTopupModal(true)}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Top Up Quota
                  </Button>
                  
                  <Button 
                    onClick={() => loadDashboardData()}
                    className="w-full justify-start"
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Data
                  </Button>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>
                    Your latest installations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dashboardData.recentActivity.length === 0 ? (
                    <div className="text-center py-8">
                      <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No installations yet</p>
                      <p className="text-sm text-muted-foreground">Start by installing Windows on your VPS</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {dashboardData.recentActivity.slice(0, 3).map((install: any) => (
                        <div key={install.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{install.ip}</p>
                              <p className="text-sm text-muted-foreground">{install.win_ver}</p>
                            </div>
                          </div>
                          {getStatusBadge(install.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Install Windows Tab */}
          <TabsContent value="install" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Install Windows on VPS</CardTitle>
                <CardDescription>
                  Transform your Linux VPS into a Windows RDP environment
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dashboardData.stats.quota <= 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      You don't have enough quota to install Windows. Please top up your quota first.
                      <Button 
                        onClick={() => setShowTopupModal(true)}
                        variant="link" 
                        className="p-0 ml-2 h-auto"
                      >
                        Top up now
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <form onSubmit={handleSubmit(onInstallSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="ip">VPS IP Address *</Label>
                        <Input
                          id="ip"
                          placeholder="192.168.1.100"
                          {...register('ip')}
                          className={errors.ip ? 'border-destructive' : ''}
                        />
                        {errors.ip && (
                          <p className="text-sm text-destructive">{errors.ip.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="passwd_vps">VPS Root Password *</Label>
                        <Input
                          id="passwd_vps"
                          type="password"
                          placeholder="Your VPS root password"
                          {...register('passwd_vps')}
                          className={errors.passwd_vps ? 'border-destructive' : ''}
                        />
                        {errors.passwd_vps && (
                          <p className="text-sm text-destructive">{errors.passwd_vps.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="win_ver">Windows Version *</Label>
                        <Select onValueChange={(value) => register('win_ver').onChange({ target: { value } })}>
                          <SelectTrigger className={errors.win_ver ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Select Windows version" />
                          </SelectTrigger>
                          <SelectContent>
                            {windowsVersions.map((version) => (
                              <SelectItem key={version.id} value={version.slug}>
                                {version.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.win_ver && (
                          <p className="text-sm text-destructive">{errors.win_ver.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="passwd_rdp">RDP Password *</Label>
                        <div className="relative">
                          <Input
                            id="passwd_rdp"
                            type={showRdpPassword ? 'text' : 'password'}
                            placeholder="Windows RDP password"
                            {...register('passwd_rdp')}
                            className={errors.passwd_rdp ? 'border-destructive pr-10' : 'pr-10'}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowRdpPassword(!showRdpPassword)}
                          >
                            {showRdpPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        {errors.passwd_rdp && (
                          <p className="text-sm text-destructive">{errors.passwd_rdp.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Password for Windows Administrator account (cannot start with #)
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Installation Requirements</h4>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                        <li>• VPS must be running Ubuntu 20/22 or Debian 12</li>
                        <li>• At least 20GB free disk space</li>
                        <li>• Stable internet connection</li>
                        <li>• SSH access enabled (port 22)</li>
                      </ul>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isInstalling || dashboardData.stats.quota <= 0}
                    >
                      {isInstalling ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting Installation...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Start Installation (1 Quota)
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Installation History</CardTitle>
                <CardDescription>
                  View all your Windows installations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {installHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <Server className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No installations yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start by installing Windows on your first VPS
                    </p>
                    <Button onClick={() => document.querySelector('[data-state="install"]')?.click()}>
                      <Plus className="mr-2 h-4 w-4" />
                      Install Windows
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Windows Version</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installHistory.map((install) => (
                          <TableRow key={install.id}>
                            <TableCell className="font-mono">{install.ip}</TableCell>
                            <TableCell>{install.win_ver}</TableCell>
                            <TableCell>{getStatusBadge(install.status)}</TableCell>
                            <TableCell>{formatDate(install.created_at)}</TableCell>
                            <TableCell>{formatDate(install.updated_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Topup Modal */}
      <TopupModal
        open={showTopupModal}
        onOpenChange={setShowTopupModal}
        onSuccess={() => {
          loadDashboardData();
          setShowTopupModal(false);
        }}
      />

      {/* Click outside to close notifications */}
      {showNotifications && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}