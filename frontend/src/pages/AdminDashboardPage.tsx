import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { 
  apiService, 
  WindowsVersion, 
  Product, 
  User, 
  InstallData,
  CreateWindowsVersionRequest,
  CreateProductRequest,
  PaymentMethod
} from '@/services/api';
import { 
  Code, 
  LogOut, 
  Settings, 
  Bell,
  Monitor,
  Package,
  Users,
  Database,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Loader2,
  Plus,
  Edit,
  Trash2,
  Shield,
  Clock,
  Eye,
  CreditCard,
  Menu,
  X,
  UserPlus,
  Coins,
  LayoutDashboard
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'windows' | 'products' | 'users' | 'installs' | 'payments'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Data states
  const [windowsVersions, setWindowsVersions] = useState<WindowsVersion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [installData, setInstallData] = useState<InstallData[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  
  // Dialog states
  const [windowsDialog, setWindowsDialog] = useState(false);
  const [productDialog, setProductDialog] = useState(false);
  const [editingWindows, setEditingWindows] = useState<WindowsVersion | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // User management states
  const [deleteUserDialog, setDeleteUserDialog] = useState(false);
  const [quotaDialog, setQuotaDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [quotaForm, setQuotaForm] = useState({ amount: 0, operation: 'add' });
  
  // Form states
  const [windowsForm, setWindowsForm] = useState<CreateWindowsVersionRequest>({
    name: '',
    slug: ''
  });
  
  const [productForm, setProductForm] = useState<CreateProductRequest>({
    name: '',
    description: '',
    price: 0,
    image_url: ''
  });
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const { state, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is admin
    if (state.user && state.user.admin !== 1) {
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: 'You do not have admin privileges.',
      });
      navigate('/dashboard');
      return;
    }
    
    loadData();
  }, [state.user, navigate]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [windowsRes, productsRes, usersRes, installsRes, paymentsRes] = await Promise.all([
        apiService.getAdminWindowsVersions(),
        apiService.getAdminProducts(),
        apiService.getAdminUsers(),
        apiService.getAdminInstallData(),
        apiService.getAdminPaymentMethods()
      ]);

      if (windowsRes.data.data) setWindowsVersions(windowsRes.data.data);
      if (productsRes.data.data) setProducts(productsRes.data.data);
      if (usersRes.data.data) setUsers(usersRes.data.data);
      if (installsRes.data.data) setInstallData(installsRes.data.data);
      if (paymentsRes.data.data) setPaymentMethods(paymentsRes.data.data);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load data',
        description: error.message || 'Please try refreshing the page.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      navigate('/');
    }
  };

  // Windows Version handlers
  const handleWindowsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      
      if (editingWindows) {
        await apiService.updateWindowsVersion(editingWindows.id, windowsForm);
        toast({ title: 'Windows version updated successfully' });
      } else {
        await apiService.createWindowsVersion(windowsForm);
        toast({ title: 'Windows version created successfully' });
      }
      
      setWindowsDialog(false);
      setEditingWindows(null);
      setWindowsForm({ name: '', slug: '' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Operation failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWindows = async (id: number) => {
    if (!confirm('Are you sure you want to delete this Windows version?')) return;
    
    try {
      await apiService.deleteWindowsVersion(id);
      toast({ title: 'Windows version deleted successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  // Product handlers
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      
      // Get token using the apiService method
      const token = apiService.getAuthToken();
      
      if (!token) {
        toast({
          variant: 'destructive',
          title: 'Authentication required',
          description: 'Please login again.',
        });
        return;
      }
      
      // Get the API base URL
      const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('name', productForm.name);
      formData.append('description', productForm.description);
      formData.append('price', productForm.price.toString());
      
      if (selectedImage) {
        formData.append('image', selectedImage);
      }
      
      if (editingProduct) {
        // For update, we need to handle it differently since we might not have a new image
        const response = await fetch(`${apiBaseUrl}/admin/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to update product');
        }
        
        toast({ title: 'Product updated successfully' });
      } else {
        // For create
        const response = await fetch(`${apiBaseUrl}/admin/products`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create product');
        }
        
        toast({ title: 'Product created successfully' });
      }
      
      setProductDialog(false);
      setEditingProduct(null);
      setProductForm({ name: '', description: '', price: 0, image_url: '' });
      setSelectedImage(null);
      setImagePreview(null);
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Operation failed',
        description: error.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await apiService.deleteProduct(id);
      toast({ title: 'Product deleted successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  // User handlers
  const handleUpdateUser = async (userId: number, updates: { is_active?: boolean; admin?: number; telegram?: string }) => {
    try {
      await apiService.updateUser(userId, updates);
      toast({ title: 'User updated successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  // New user management handlers
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      setIsSubmitting(true);
      
      // Call the delete user API endpoint
      const token = apiService.getAuthToken();
      const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
      
      const response = await fetch(`${apiBaseUrl}/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete user');
      }
      
      toast({ title: 'User deleted successfully' });
      setDeleteUserDialog(false);
      setSelectedUser(null);
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateQuota = async () => {
    if (!selectedUser) return;
    
    try {
      setIsSubmitting(true);
      
      // Call the update quota API endpoint
      const token = apiService.getAuthToken();
      const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';
      
      const response = await fetch(`${apiBaseUrl}/admin/users/${selectedUser.id}/quota`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: quotaForm.amount,
          operation: quotaForm.operation
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update quota');
      }
      
      const result = await response.json();
      
      toast({ 
        title: 'Quota updated successfully',
        description: `User quota ${quotaForm.operation === 'add' ? 'increased' : 'set'} to ${result.data.newQuota}`
      });
      
      setQuotaDialog(false);
      setSelectedUser(null);
      setQuotaForm({ amount: 0, operation: 'add' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Install data handlers
  const handleUpdateInstallStatus = async (installId: number, status: string) => {
    try {
      await apiService.updateInstallData(installId, { status });
      toast({ title: 'Install status updated successfully' });
      await loadData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.response?.data?.message || 'Please try again.',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'running':
        return <Badge variant="outline" className="text-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-600"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Sidebar menu items
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'windows',
      label: 'Windows Versions',
      icon: Monitor,
    },
    {
      id: 'products',
      label: 'Products',
      icon: Package,
    },
    {
      id: 'users',
      label: 'Users',
      icon: Users,
    },
    {
      id: 'installs',
      label: 'Install Data',
      icon: Database,
    },
    {
      id: 'payments',
      label: 'Payment Methods',
      icon: CreditCard,
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>

            <div className='block sm:hidden'>
              <h1 className='text-sm font-bold'>XME Admin</h1>
            </div>

            <div className='hidden sm:block'>
              <h1 className="text-md md:text-xl font-bold">XME Projects Admin</h1>
              <p className="text-sm text-muted-foreground">Administrative Dashboard</p>
            </div>

          </div>

          <div className="flex items-center gap-1 md:gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <Eye className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">User View</span>
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="sm">
              <Bell className="h-4 w-4" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback>
                      {state.user?.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline">{state.user?.username}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Admin Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Fixed Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header Spacer */}
            <div className="h-20 border-b flex items-center px-6">
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                <div className="px-4 py-6">
                  <nav className="space-y-2">
                    {menuItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id as any);
                            setSidebarOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </ScrollArea>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 pt-20">
          <div className="container mx-auto px-6 pt-2 pb-6 md:py-8">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Admin Dashboard</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">Manage your XME Projects platform</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Windows Versions</p>
                          <p className="text-2xl font-bold text-foreground">{windowsVersions.length}</p>
                        </div>
                        <Monitor className="h-8 w-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Products</p>
                          <p className="text-2xl font-bold text-foreground">{products.length}</p>
                        </div>
                        <Package className="h-8 w-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Users</p>
                          <p className="text-2xl font-bold text-foreground">{users.length}</p>
                        </div>
                        <Users className="h-8 w-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Installs</p>
                          <p className="text-2xl font-bold text-foreground">{installData.length}</p>
                        </div>
                        <Database className="h-8 w-8 text-purple-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="col-span-2 md:col-span-3 lg:col-span-1">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs md:text-sm font-medium text-muted-foreground">Payment Methods</p>
                          <p className="text-2xl font-bold text-foreground">{paymentMethods.filter(p => p.is_enabled).length}/{paymentMethods.length}</p>
                        </div>
                        <CreditCard className="h-8 w-8 text-orange-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Common administrative tasks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <Button 
                        onClick={() => setActiveTab('windows')}
                        className="h-16 flex items-center justify-start gap-3 text-left"
                        variant="outline"
                      >
                        <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Monitor className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Manage Windows</p>
                          <p className="text-xs md:text-sm text-muted-foreground">Add/edit versions</p>
                        </div>
                      </Button>
                      
                      <Button 
                        onClick={() => setActiveTab('users')}
                        className="h-16 flex items-center justify-start gap-3 text-left"
                        variant="outline"
                      >
                        <div className="h-10 w-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">Manage Users</p>
                          <p className="text-xs md:text-sm text-muted-foreground">User administration</p>
                        </div>
                      </Button>

                      <Button 
                        onClick={() => setActiveTab('payments')}
                        className="h-16 flex items-center justify-start gap-3 text-left"
                        variant="outline"
                      >
                        <div className="h-10 w-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                          <CreditCard className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                          <p className="font-medium">Payment Settings</p>
                          <p className="text-xs md:text-sm text-muted-foreground">Configure payments</p>
                        </div>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Windows Versions Tab */}
            {activeTab === 'windows' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Windows Versions</h2>
                    <p className="text-xs md:text-sm text-muted-foreground">Manage available Windows versions</p>
                  </div>
                  <Dialog open={windowsDialog} onOpenChange={setWindowsDialog}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setEditingWindows(null);
                        setWindowsForm({ name: '', slug: '' });
                      }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Version
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="dialog-responsive">
                      <DialogHeader>
                        <DialogTitle>
                          {editingWindows ? 'Edit Windows Version' : 'Add Windows Version'}
                        </DialogTitle>
                        <DialogDescription>
                          {editingWindows ? 'Update the Windows version details' : 'Create a new Windows version'}
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleWindowsSubmit}>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="name">Name</Label>
                            <Input
                              id="name"
                              value={windowsForm.name}
                              onChange={(e) => setWindowsForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Windows 10 Spectre"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="slug">Slug</Label>
                            <Input
                              id="slug"
                              value={windowsForm.slug}
                              onChange={(e) => setWindowsForm(prev => ({ ...prev, slug: e.target.value }))}
                              placeholder="w10s"
                              required
                            />
                          </div>
                        </div>
                        <DialogFooter className="mt-6">
                          <Button type="button" variant="outline" onClick={() => setWindowsDialog(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {editingWindows ? 'Update' : 'Create'}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="table-responsive">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Slug</TableHead>
                            <TableHead className="hidden md:table-cell">Created</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {windowsVersions.map((version) => (
                            <TableRow key={version.id}>
                              <TableCell className="font-medium">{version.name}</TableCell>
                              <TableCell className="font-mono">{version.slug}</TableCell>
                              <TableCell className="hidden md:table-cell">{new Date(version.created_at).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setEditingWindows(version);
                                      setWindowsForm({ name: version.name, slug: version.slug });
                                      setWindowsDialog(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteWindows(version.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Products</h2>
                    <p className="text-xs md:text-sm text-muted-foreground">Manage products and services</p>
                  </div>
                  <Dialog open={productDialog} onOpenChange={setProductDialog}>
                    <DialogTrigger asChild>
                      <Button onClick={() => {
                        setEditingProduct(null);
                        setProductForm({ name: '', description: '', price: 0, image_url: '' });
                        setSelectedImage(null);
                        setImagePreview(null);
                      }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Product
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="dialog-responsive">
                      <DialogHeader>
                        <DialogTitle>
                          {editingProduct ? 'Edit Product' : 'Add Product'}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleProductSubmit}>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="product-name">Name</Label>
                            <Input
                              id="product-name"
                              value={productForm.name}
                              onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                              id="description"
                              value={productForm.description}
                              onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label htmlFor="price">Price</Label>
                            <Input
                              id="price"
                              type="number"
                              step="0.01"
                              value={productForm.price}
                              onChange={(e) => setProductForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="image">Product Image</Label>
                            <Input
                              id="image"
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              className="mb-2"
                            />
                            {imagePreview && (
                              <div className="mt-2">
                                <Label>Preview:</Label>
                                <img 
                                  src={imagePreview} 
                                  alt="Preview" 
                                  className="w-32 h-32 object-cover border rounded"
                                />
                              </div>
                            )}
                            {editingProduct?.image_url && !imagePreview && (
                              <div className="mt-2">
                                <Label>Current Image:</Label>
                                <img 
                                  src={editingProduct.image_url.startsWith('/') 
                                    ? `http://localhost:3001${editingProduct.image_url}` 
                                    : editingProduct.image_url
                                  } 
                                  alt="Current" 
                                  className="w-32 h-32 object-cover border rounded"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <DialogFooter className="mt-6">
                          <Button type="button" variant="outline" onClick={() => setProductDialog(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {editingProduct ? 'Update' : 'Create'}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="table-responsive">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead className="hidden md:table-cell">Created</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell>{product.price} IDR</TableCell>
                              <TableCell className="hidden md:table-cell">{new Date(product.created_at).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setEditingProduct(product);
                                      setProductForm({
                                        name: product.name,
                                        description: product.description || '',
                                        price: product.price,
                                        image_url: product.image_url || ''
                                      });
                                      setSelectedImage(null);
                                      setImagePreview(null);
                                      setProductDialog(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteProduct(product.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Users</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">Manage user accounts and permissions</p>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="table-responsive">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead className="hidden md:table-cell">Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="hidden lg:table-cell">Quota</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarFallback className="text-xs">
                                      {user.username.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{user.username}</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                              <TableCell>
                                <Badge variant={user.is_verified ? "default" : "secondary"}>
                                  {user.is_verified ? "Verified" : "Unverified"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={user.admin?.toString() || "0"}
                                  onValueChange={(value) => handleUpdateUser(user.id, { admin: parseInt(value) })}
                                >
                                  <SelectTrigger className="w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">User</SelectItem>
                                    <SelectItem value="1">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <Badge variant="outline">{user.quota || 0}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setQuotaForm({ amount: 0, operation: 'add' });
                                      setQuotaDialog(true);
                                    }}
                                    title="Update Quota"
                                  >
                                    <Coins className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUser(user);
                                      setDeleteUserDialog(true);
                                    }}
                                    title="Delete User"
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Install Data Tab */}
            {activeTab === 'installs' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">Install Data</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">Manage Windows installation requests</p>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="table-responsive">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>IP Address</TableHead>
                            <TableHead className="hidden md:table-cell">Windows Version</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden lg:table-cell">Created</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {installData.map((install) => (
                            <TableRow key={install.id}>
                              <TableCell>{install.username}</TableCell>
                              <TableCell className="font-mono">{install.ip}</TableCell>
                              <TableCell className="hidden md:table-cell">{install.win_ver}</TableCell>
                              <TableCell>{getStatusBadge(install.status)}</TableCell>
                              <TableCell className="hidden lg:table-cell">{new Date(install.created_at).toLocaleDateString()}</TableCell>
                              <TableCell>
                                <Select
                                  value={install.status}
                                  onValueChange={(value) => handleUpdateInstallStatus(install.id, value)}
                                >
                                  <SelectTrigger className="w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="running">Running</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Payment Methods Tab */}
            {activeTab === 'payments' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Payment Methods</h2>
                    <p className="text-xs md:text-sm text-muted-foreground">Manage payment methods and their availability</p>
                  </div>
                  <Button
                    onClick={async () => {
                      try {
                        const response = await apiService.syncPaymentMethods();
                        if (response.data.success) {
                          toast({
                            title: 'Sync successful',
                            description: `Synced ${response.data.data?.totalFromTripay} payment methods from Tripay`,
                          });
                          await loadData();
                        }
                      } catch (error: any) {
                        toast({
                          variant: 'destructive',
                          title: 'Sync failed',
                          description: error.response?.data?.message || 'Failed to sync payment methods',
                        });
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Sync from Tripay</span>
                  </Button>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="table-responsive">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="hidden md:table-cell">Type</TableHead>
                            <TableHead className="hidden lg:table-cell">Fee</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentMethods.map((method) => (
                            <TableRow key={method.code}>
                              <TableCell className="font-mono">{method.code}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  {method.icon_url && (
                                    <img 
                                      src={method.icon_url} 
                                      alt={method.name}
                                      className="w-6 h-6 object-contain"
                                    />
                                  )}
                                  <span className="font-medium">{method.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline">{method.type}</Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <div className="text-sm">
                                  <div>Flat: Rp {method.fee_flat?.toLocaleString() || 0}</div>
                                  <div>Percent: {method.fee_percent || 0}%</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {method.is_enabled ? (
                                  <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Enabled
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                    Disabled
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant={method.is_enabled ? "destructive" : "default"}
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await apiService.updatePaymentMethod(method.code, {
                                        is_enabled: !method.is_enabled
                                      });
                                      toast({
                                        title: 'Payment method updated',
                                        description: `${method.name} has been ${method.is_enabled ? 'disabled' : 'enabled'}`,
                                      });
                                      await loadData();
                                    } catch (error: any) {
                                      toast({
                                        variant: 'destructive',
                                        title: 'Update failed',
                                        description: error.response?.data?.message || 'Failed to update payment method',
                                      });
                                    }
                                  }}
                                >
                                  {method.is_enabled ? 'Disable' : 'Enable'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {paymentMethods.length === 0 && (
                      <div className="text-center py-8">
                        <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium text-muted-foreground mb-2">No payment methods found</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Click "Sync from Tripay" to load payment methods from your Tripay account
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteUserDialog} onOpenChange={setDeleteUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete User Account
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete the account for <strong>{selectedUser?.username}</strong>?
                </p>
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive font-medium">⚠️ This action cannot be undone!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This will permanently delete:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc">
                    <li>User account and profile</li>
                    <li>All installation history</li>
                    <li>All transaction records</li>
                    <li>All associated data</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete User
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Quota Dialog */}
      <Dialog open={quotaDialog} onOpenChange={setQuotaDialog}>
        <DialogContent className="dialog-responsive">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Update User Quota
            </DialogTitle>
            <DialogDescription>
              Manage quota for <strong>{selectedUser?.username}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedUser && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Quota:</span>
                      <span className="font-semibold">{selectedUser.quota || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Username:</span>
                      <span className="font-medium">{selectedUser.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{selectedUser.email}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="operation">Operation</Label>
                <Select
                  value={quotaForm.operation}
                  onValueChange={(value) => setQuotaForm(prev => ({ ...prev, operation: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add to current quota</SelectItem>
                    <SelectItem value="set">Set quota to specific amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="amount">
                  {quotaForm.operation === 'add' ? 'Amount to Add' : 'New Quota Amount'}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  value={quotaForm.amount}
                  onChange={(e) => setQuotaForm(prev => ({ ...prev, amount: parseInt(e.target.value) || 0 }))}
                  placeholder="Enter amount"
                />
              </div>

              {quotaForm.amount > 0 && selectedUser && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Preview:
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {quotaForm.operation === 'add' 
                      ? `${selectedUser.quota || 0} + ${quotaForm.amount} = ${(selectedUser.quota || 0) + quotaForm.amount}`
                      : `Quota will be set to ${quotaForm.amount}`
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setQuotaDialog(false);
                setSelectedUser(null);
                setQuotaForm({ amount: 0, operation: 'add' });
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateQuota}
              disabled={isSubmitting || quotaForm.amount <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Coins className="mr-2 h-4 w-4" />
                  Update Quota
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}