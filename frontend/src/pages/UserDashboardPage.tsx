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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import TopupModal from '@/components/TopupModal';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useToast } from '@/hooks/use-toast';
import { apiService, DashboardData, WindowsVersion, InstallData } from '@/services/api';
import {
  Code,
  User,
  LogOut,
  Settings,
  Server,
  Activity,
  Coins,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Bell,
  Trash2,
  RefreshCw,
  Monitor,
  Shield,
  Zap
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
  const [showVpsPassword, setShowVpsPassword] = useState(false);
  const [showRdpPassword, setShowRdpPassword] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const { state, logout } = useAuth();
  const { notifications } = useNotifications();
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
      setIsLoading(true);
      const [dashboardResponse, versionsResponse, historyResponse] = await Promise.all([
        apiService.getDashboard(),
        apiService.getWindowsVersions(),
        apiService.getInstallHistory(),
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
    if (state.user && !state.user.is_verified) {
      navigate('/verify-email');
      return;
    }

    loadDashboardData();
  }, [state.user, navigate]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const onSubmitInstall = async (data: InstallFormData) => {
    setIsInstalling(true);
    try {
      const response = await apiService.createInstall(data);
      
      if (response.data.success) {
        toast({
          title: 'Installation Started',
          description: 'Windows installation has been initiated. You will receive notifications about the progress.',
        });
        
        // Reset form and reload data
        reset();
        await loadDashboardData();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Installation Failed',
        description: error.response?.data?.message || 'Failed to start installation',
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Activity className="w-3 h-3 mr-1" />Running</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      case 'manual_review':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"><AlertCircle className="w-3 h-3 mr-1" />Manual Review</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
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
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <span className="font-medium">{dashboardData?.user.quota || 0} Quota</span>
            </div>
            <Button
              onClick={() => setShowTopupModal(true)}
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Top Up
            </Button>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container py-8">
        <div className="space-y-8">
          {/* Welcome Section */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Welcome back, {dashboardData?.user.username}!</h1>
              <p className="text-muted-foreground">Manage your VPS to Windows installations</p>
            </div>
            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{notifications.length} new notifications</span>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total VPS</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.stats.totalVPS || 0}</div>
                <p className="text-xs text-muted-foreground">All time installations</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.stats.activeConnections || 0}</div>
                <p className="text-xs text-muted-foreground">Currently running</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.stats.successRate || '0%'}</div>
                <p className="text-xs text-muted-foreground">Installation success</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available Quota</CardTitle>
                <Coins className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboardData?.user.quota || 0}</div>
                <p className="text-xs text-muted-foreground">Installations remaining</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="install">Install Windows</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>Your latest Windows installations</CardDescription>
                </CardHeader>
                <CardContent>
                  {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 ? (
                    <div className="space-y-4">
                      {dashboardData.recentActivity.map((activity: any) => (
                        <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Monitor className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{activity.ip}</p>
                              <p className="text-sm text-muted-foreground">Windows {activity.win_ver}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(activity.status)}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(activity.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No installations yet</p>
                      <p className="text-sm text-muted-foreground">Start by installing Windows on your VPS</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Real-time Notifications */}
              {notifications.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      Live Notifications
                    </CardTitle>
                    <CardDescription>Real-time updates from your installations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {notifications.map((notification, index) => (
                        <div key={index} className="p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{notification.message}</p>
                              {notification.ip && (
                                <p className="text-xs text-muted-foreground">IP: {notification.ip}</p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(notification.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Install Windows Tab */}
            <TabsContent value="install" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Install Windows on VPS
                  </CardTitle>
                  <CardDescription>
                    Transform your Linux VPS into a Windows RDP environment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(dashboardData?.user.quota || 0) <= 0 ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        You don't have enough quota to install Windows. Please top up your quota first.
                        <Button 
                          onClick={() => setShowTopupModal(true)}
                          size="sm" 
                          className="ml-2"
                        >
                          Top Up Now
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <form onSubmit={handleSubmit(onSubmitInstall)} className="space-y-6">
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
                          <li>• VPS must have at least 20GB disk space</li>
                          <li>• Root SSH access is required</li>
                          <li>• Installation takes approximately 5-15 minutes</li>
                          <li>• VPS will reboot during the process</li>
                        </ul>
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={isInstalling || (dashboardData?.user.quota || 0) <= 0}
                      >
                        {isInstalling ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Installing Windows...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            Install Windows (1 Quota)
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
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Installation History
                    </CardTitle>
                    <CardDescription>Track all your Windows installations</CardDescription>
                  </div>
                  <Button
                    onClick={loadDashboardData}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {installHistory.length > 0 ? (
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
                              <TableCell>Windows {install.win_ver}</TableCell>
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
                  ) : (
                    <div className="text-center py-8">
                      <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No installation history</p>
                      <p className="text-sm text-muted-foreground">Your installations will appear here</p>
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
        onSuccess={loadDashboardData}
      />
    </div>
  );
}