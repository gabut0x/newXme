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
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import TopupModal from '@/components/TopupModal';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/use-toast';
import { 
  apiService, 
  DashboardData, 
  WindowsVersion, 
  InstallData,
  CreateInstallRequest
} from '@/services/api';
import {
  Code,
  Server,
  Activity,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Coins,
  Bell,
  BellRing,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';

const installSchema = z.object({
  ip: z.string()
    .min(1, 'IP address is required')
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address format'),
  passwd_vps: z.string()
    .min(1, 'VPS password is required'),
  win_ver: z.string()
    .min(1, 'Windows version is required'),
  passwd_rdp: z.string()
    .min(4, 'RDP password must be at least 4 characters')
    .refine((password) => !password.startsWith('#'), {
      message: 'RDP password cannot start with "#" character'
    }),
});

type InstallFormData = z.infer<typeof installSchema>;

export default function UserDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [installHistory, setInstallHistory] = useState<InstallData[]>([]);
  const [windowsVersions, setWindowsVersions] = useState<WindowsVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showVpsPassword, setShowVpsPassword] = useState(false);
  const [showRdpPassword, setShowRdpPassword] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { state, logout } = useAuth();
  const { notifications, isConnected } = useNotifications();
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InstallFormData>({
    resolver: zodResolver(installSchema),
  });

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      const [dashboardResponse, historyResponse, versionsResponse] = await Promise.all([
        apiService.getDashboard(),
        apiService.getInstallHistory(),
        apiService.getWindowsVersions(),
      ]);

      if (dashboardResponse.data.success) {
        setDashboardData(dashboardResponse.data.data);
      }

      if (historyResponse.data.success) {
        setInstallHistory(historyResponse.data.data);
      }

      if (versionsResponse.data.success) {
        setWindowsVersions(versionsResponse.data.data);
      }
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load dashboard data',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh data function
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await loadDashboardData();
      toast({
        title: 'Data refreshed',
        description: 'Dashboard data has been updated',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Refresh failed',
        description: 'Failed to refresh dashboard data',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Listen for real-time notifications and update install history
  useEffect(() => {
    if (notifications.length > 0) {
      const latestNotification = notifications[0];
      
      // If it's an install status update, refresh the install history
      if (latestNotification.type === 'install_status_update' && latestNotification.installId) {
        // Update install history in real-time
        setInstallHistory(prevHistory => {
          return prevHistory.map(install => {
            if (install.id === latestNotification.installId) {
              return {
                ...install,
                status: latestNotification.status || install.status,
                updated_at: latestNotification.timestamp || install.updated_at
              };
            }
            return install;
          });
        });

        // Also update dashboard stats if needed
        if (dashboardData) {
          setDashboardData(prevData => {
            if (!prevData) return prevData;
            
            // Recalculate stats based on updated install history
            const updatedHistory = installHistory.map(install => {
              if (install.id === latestNotification.installId) {
                return {
                  ...install,
                  status: latestNotification.status || install.status
                };
              }
              return install;
            });

            const activeConnections = updatedHistory.filter(install => 
              ['pending', 'running', 'manual_review'].includes(install.status)
            ).length;

            const completedInstalls = updatedHistory.filter(install => 
              install.status === 'completed'
            ).length;

            const failedInstalls = updatedHistory.filter(install => 
              ['failed', 'cancelled'].includes(install.status)
            ).length;

            const successRate = updatedHistory.length > 0 
              ? Math.round((completedInstalls / updatedHistory.length) * 100)
              : 0;

            return {
              ...prevData,
              stats: {
                ...prevData.stats,
                activeConnections,
                completedInstalls,
                failedInstalls,
                successRate: `${successRate}%`
              }
            };
          });
        }
      }
    }
  }, [notifications, dashboardData, installHistory]);

  // Redirect to verify email if not verified
  useEffect(() => {
    if (state.user && !state.user.is_verified) {
      navigate('/verify-email');
    }
  }, [state.user, navigate]);

  const onSubmit = async (data: InstallFormData) => {
    setIsSubmitting(true);
    try {
      const response = await apiService.createInstall(data);
      
      if (response.data.success) {
        toast({
          title: 'Installation started',
          description: 'Windows installation has been initiated. You will be notified when it completes.',
        });
        
        // Reset form
        reset();
        
        // Refresh data to show new installation
        await loadDashboardData();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Installation failed',
        description: error.response?.data?.message || 'Failed to start installation',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>;
      case 'running':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Completed
        </Badge>;
      case 'failed':
        return <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </Badge>;
      case 'manual_review':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
          <AlertCircle className="w-3 h-3 mr-1" />
          Manual Review
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
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
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground">Failed to load dashboard data</p>
            <Button onClick={loadDashboardData} className="mt-4">
              Try Again
            </Button>
          </div>
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
            {/* Notification Status Indicator */}
            <div className="flex items-center gap-2">
              {isConnected ? (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Wifi className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Live</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <WifiOff className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Offline</span>
                </div>
              )}
            </div>

            {/* Notifications Bell */}
            <div className="relative">
              <Button variant="outline" size="sm" className="relative">
                {notifications.length > 0 ? (
                  <BellRing className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshData}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {state.user?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">{state.user?.username}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Profile Settings
                </DropdownMenuItem>
                {state.user?.admin === 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/admin')}>
                      <Users className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container py-8">
        <div className="space-y-8">
          {/* Welcome Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">
                Welcome back, {dashboardData.user.profile?.first_name || dashboardData.user.username}!
              </h1>
              <p className="text-muted-foreground">
                Manage your VPS installations and monitor your quota usage
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Available Quota</p>
                <p className="text-2xl font-bold flex items-center gap-2">
                  <Coins className="h-5 w-5 text-yellow-500" />
                  {dashboardData.stats.quota}
                </p>
              </div>
              <Button onClick={() => setShowTopupModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Topup
              </Button>
            </div>
          </div>

          {/* Real-time Notifications */}
          {notifications.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BellRing className="h-5 w-5" />
                Recent Notifications
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {notifications.slice(0, 3).map((notification, index) => (
                  <Alert key={index} className="border-l-4 border-l-blue-500">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex justify-between items-start">
                        <span>{notification.message}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(notification.timestamp).toLocaleTimeString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total VPS</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData.stats.totalVPS}</div>
                <p className="text-xs text-muted-foreground">
                  All time installations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData.stats.activeConnections}</div>
                <p className="text-xs text-muted-foreground">
                  Currently processing
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
                  Installation success
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
                  Ready to use
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="install" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="install">New Installation</TabsTrigger>
              <TabsTrigger value="history">Install History</TabsTrigger>
            </TabsList>

            {/* New Installation Tab */}
            <TabsContent value="install" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Install Windows on VPS</CardTitle>
                  <CardDescription>
                    Transform your VPS into a Windows RDP environment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Label htmlFor="passwd_vps">VPS Root Password *</Label>
                        <div className="relative">
                          <Input
                            id="passwd_vps"
                            type={showVpsPassword ? 'text' : 'password'}
                            placeholder="Enter VPS root password"
                            {...register('passwd_vps')}
                            className={errors.passwd_vps ? 'border-destructive pr-10' : 'pr-10'}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowVpsPassword(!showVpsPassword)}
                          >
                            {showVpsPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        {errors.passwd_vps && (
                          <p className="text-sm text-destructive">{errors.passwd_vps.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="passwd_rdp">RDP Password *</Label>
                        <div className="relative">
                          <Input
                            id="passwd_rdp"
                            type={showRdpPassword ? 'text' : 'password'}
                            placeholder="Set Windows RDP password"
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
                        <li>• Root SSH access required</li>
                        <li>• Minimum 20GB disk space available</li>
                        <li>• Stable internet connection</li>
                      </ul>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isSubmitting || dashboardData.stats.quota <= 0}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting Installation...
                        </>
                      ) : (
                        <>
                          <Server className="mr-2 h-4 w-4" />
                          Start Installation (1 Quota)
                        </>
                      )}
                    </Button>

                    {dashboardData.stats.quota <= 0 && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          You don't have enough quota to start an installation. 
                          <Button 
                            variant="link" 
                            className="p-0 h-auto font-medium"
                            onClick={() => setShowTopupModal(true)}
                          >
                            Topup your quota
                          </Button> to continue.
                        </AlertDescription>
                      </Alert>
                    )}
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Install History Tab */}
            <TabsContent value="history" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Installation History</CardTitle>
                  <CardDescription>
                    Track your Windows installation progress and history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {installHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No installations yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Start your first Windows installation to see it here
                      </p>
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
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(install.created_at)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDate(install.updated_at)}
                              </TableCell>
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
        </div>
      </main>

      {/* Topup Modal */}
      <TopupModal
        open={showTopupModal}
        onOpenChange={setShowTopupModal}
        onSuccess={() => {
          loadDashboardData(); // Refresh dashboard data after successful topup
        }}
      />
    </div>
  );
}