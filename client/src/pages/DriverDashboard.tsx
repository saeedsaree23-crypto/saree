import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { DriverCommunication } from '@/components/DriverCommunication';
import { 
  Truck, 
  MapPin, 
  Clock, 
  DollarSign, 
  LogOut,
  Navigation,
  Phone,
  CheckCircle,
  XCircle,
  Package,
  Bell,
  User,
  Calendar,
  Target,
  AlertCircle,
  RefreshCw,
  Eye,
  MessageCircle,
  Store,
  Map,
  Activity,
  TrendingUp,
  Star,
  Settings,
  Zap,
  Timer,
  Route,
  Wallet
} from 'lucide-react';
import type { Order, Driver } from '@shared/schema';

interface DriverDashboardProps {
  onLogout: () => void;
}

interface DriverStats {
  todayOrders: number;
  todayEarnings: number;
  weeklyOrders: number;
  weeklyEarnings: number;
  monthlyOrders: number;
  monthlyEarnings: number;
  totalOrders: number;
  totalEarnings: number;
  completedOrders: number;
  cancelledOrders: number;
  averageRating: number;
  averageDeliveryTime: number;
  successRate: number;
}

interface OrderWithDetails extends Order {
  restaurantName?: string;
  restaurantPhone?: string;
  restaurantAddress?: string;
  estimatedEarnings?: number;
  distance?: number;
  priority?: 'high' | 'medium' | 'low';
}

export const DriverDashboard: React.FC<DriverDashboardProps> = ({ onLogout }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [driverStatus, setDriverStatus] = useState<'available' | 'busy' | 'offline'>('offline');
  const [currentDriver, setCurrentDriver] = useState<Driver | null>(null);
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [showOrderDetailsDialog, setShowOrderDetailsDialog] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);

  // التحقق من تسجيل الدخول عند تحميل المكون
  useEffect(() => {
    const token = localStorage.getItem('driver_token');
    const driverData = localStorage.getItem('driver_user');
    
    if (!token || !driverData) {
      window.location.href = '/driver-login';
      return;
    }

    try {
      const driver = JSON.parse(driverData);
      setCurrentDriver(driver);
      setDriverStatus(driver.isAvailable ? 'available' : 'offline');
    } catch (error) {
      console.error('خطأ في تحليل بيانات السائق:', error);
      handleLogout();
    }
  }, []);

  // الحصول على الموقع الحالي
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          
          // تحديث موقع السائق في الخادم
          if (currentDriver?.id) {
            updateDriverLocation(position.coords.latitude, position.coords.longitude);
          }
        },
        (error) => {
          console.error('خطأ في تتبع الموقع:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [currentDriver]);

  // جلب الطلبات المتاحة (غير مُعيَّنة لسائق) مع تحديث تلقائي
  const { data: availableOrders = [], isLoading: availableLoading, refetch: refetchAvailable } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders', { status: 'confirmed', available: true }],
    queryFn: async () => {
      const response = await fetch('/api/orders?status=confirmed');
      if (!response.ok) throw new Error('فشل في جلب الطلبات المتاحة');
      const data = await response.json();
      
      // فلترة الطلبات غير المُعيَّنة لسائق وإضافة تفاصيل إضافية
      const availableOrders = Array.isArray(data) ? data.filter((order: Order) => !order.driverId) : [];
      
      // إضافة تفاصيل إضافية لكل طلب
      const enhancedOrders = await Promise.all(availableOrders.map(async (order: Order) => {
        const totalAmount = parseFloat(order.totalAmount || '0');
        const estimatedEarnings = Math.round(totalAmount * 0.15); // 15% عمولة
        
        // تحديد أولوية الطلب بناءً على القيمة والوقت
        let priority: 'high' | 'medium' | 'low' = 'medium';
        const orderAge = Date.now() - new Date(order.createdAt).getTime();
        const ageInMinutes = orderAge / (1000 * 60);
        
        if (totalAmount > 100 || ageInMinutes > 15) {
          priority = 'high';
        } else if (totalAmount < 50 && ageInMinutes < 5) {
          priority = 'low';
        }

        return {
          ...order,
          restaurantName: 'مطعم تجريبي', // في التطبيق الحقيقي سيتم جلبها من قاعدة البيانات
          restaurantPhone: '+967771234567',
          restaurantAddress: 'صنعاء، شارع الزبيري',
          estimatedEarnings,
          distance: Math.random() * 10 + 1, // مسافة تجريبية
          priority
        } as OrderWithDetails;
      }));

      // ترتيب حسب الأولوية ثم الوقت
      return enhancedOrders.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        if (priorityOrder[a.priority!] !== priorityOrder[b.priority!]) {
          return priorityOrder[b.priority!] - priorityOrder[a.priority!];
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    },
    enabled: !!currentDriver && driverStatus === 'available',
    refetchInterval: autoRefresh ? 3000 : false, // تحديث كل 3 ثوانِ
  });

  // جلب طلبات السائق الحالية مع تحديث سريع
  const { data: myOrders = [], isLoading: myOrdersLoading, refetch: refetchMyOrders } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders', { driverId: currentDriver?.id }],
    queryFn: async () => {
      if (!currentDriver?.id) return [];
      const response = await fetch(`/api/orders?driverId=${currentDriver.id}`);
      if (!response.ok) throw new Error('فشل في جلب طلباتي');
      const data = await response.json();
      
      // إضافة تفاصيل إضافية
      const enhancedOrders = (Array.isArray(data) ? data : []).map((order: Order) => ({
        ...order,
        restaurantName: 'مطعم تجريبي',
        restaurantPhone: '+967771234567',
        restaurantAddress: 'صنعاء، شارع الزبيري',
        estimatedEarnings: Math.round(parseFloat(order.totalAmount || '0') * 0.15),
        distance: Math.random() * 10 + 1
      })) as OrderWithDetails[];

      return enhancedOrders;
    },
    enabled: !!currentDriver,
    refetchInterval: autoRefresh ? 2000 : false, // تحديث كل ثانيتين
  });

  // جلب إحصائيات السائق المحسنة
  const { data: driverStats } = useQuery<DriverStats>({
    queryKey: ['/api/drivers', currentDriver?.id, 'stats'],
    queryFn: async () => {
      if (!currentDriver?.id) return null;
      
      // جلب إحصائيات مختلفة للفترات المختلفة
      const [todayStats, weekStats, monthStats, totalStats] = await Promise.all([
        fetch(`/api/drivers/${currentDriver.id}/stats?period=today`).then(res => res.json()),
        fetch(`/api/drivers/${currentDriver.id}/stats?period=week`).then(res => res.json()),
        fetch(`/api/drivers/${currentDriver.id}/stats?period=month`).then(res => res.json()),
        fetch(`/api/drivers/${currentDriver.id}/stats?period=total`).then(res => res.json())
      ]);

      return {
        todayOrders: todayStats?.totalOrders || 0,
        todayEarnings: todayStats?.totalEarnings || 0,
        weeklyOrders: weekStats?.totalOrders || 0,
        weeklyEarnings: weekStats?.totalEarnings || 0,
        monthlyOrders: monthStats?.totalOrders || 0,
        monthlyEarnings: monthStats?.totalEarnings || 0,
        totalOrders: totalStats?.totalOrders || 0,
        totalEarnings: totalStats?.totalEarnings || 0,
        completedOrders: totalStats?.completedOrders || 0,
        cancelledOrders: totalStats?.cancelledOrders || 0,
        averageRating: 4.8,
        averageDeliveryTime: 28,
        successRate: totalStats?.totalOrders > 0 ? 
          Math.round((totalStats?.completedOrders / totalStats?.totalOrders) * 100) : 0
      };
    },
    enabled: !!currentDriver,
    refetchInterval: 30000, // تحديث كل 30 ثانية
  });

  // قبول طلب مع تحسينات
  const acceptOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (!currentDriver?.id) throw new Error('معرف السائق غير موجود');
      
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          driverId: currentDriver.id,
          status: 'preparing',
          updatedBy: currentDriver.id,
          updatedByType: 'driver',
          acceptedAt: new Date().toISOString(),
          driverLocation: currentLocation
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'فشل في قبول الطلب');
      }
      
      return response.json();
    },
    onSuccess: (data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      setDriverStatus('busy');
      
      // إشعار صوتي
      if (soundEnabled) {
        playNotificationSound('success');
      }
      
      toast({
        title: "تم قبول الطلب بنجاح ✅",
        description: `تم تعيين الطلب ${orderId.slice(0, 8)} لك`,
      });
    },
    onError: (error: Error) => {
      if (soundEnabled) {
        playNotificationSound('error');
      }
      
      toast({
        title: "خطأ في قبول الطلب",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // تحديث حالة الطلب مع تحسينات
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, location }: { orderId: string; status: string; location?: string }) => {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status,
          updatedBy: currentDriver?.id,
          updatedByType: 'driver',
          driverLocation: currentLocation,
          statusUpdatedAt: new Date().toISOString(),
          ...(location && { deliveryLocation: location })
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'فشل في تحديث حالة الطلب');
      }
      
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      
      if (variables.status === 'delivered') {
        setDriverStatus('available');
        if (soundEnabled) {
          playNotificationSound('delivery');
        }
      }
      
      const statusText = getStatusText(variables.status);
      toast({
        title: "تم تحديث حالة الطلب ✅",
        description: `تم تحديث الطلب إلى: ${statusText}`,
      });
    },
    onError: (error: Error) => {
      if (soundEnabled) {
        playNotificationSound('error');
      }
      
      toast({
        title: "خطأ في تحديث الطلب",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // تحديث حالة السائق مع تحديث الموقع
  const updateDriverStatusMutation = useMutation({
    mutationFn: async (isAvailable: boolean) => {
      if (!currentDriver?.id) throw new Error('معرف السائق غير موجود');
      
      const response = await fetch(`/api/drivers/${currentDriver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          isAvailable,
          currentLocation: currentLocation ? `${currentLocation.lat},${currentLocation.lng}` : null,
          lastActiveAt: new Date().toISOString()
        }),
      });
      
      if (!response.ok) throw new Error('فشل في تحديث حالة السائق');
      return response.json();
    },
    onSuccess: (data, isAvailable) => {
      setDriverStatus(isAvailable ? 'available' : 'offline');
      
      if (currentDriver) {
        const updatedDriver = { ...currentDriver, isAvailable };
        setCurrentDriver(updatedDriver);
        localStorage.setItem('driver_user', JSON.stringify(updatedDriver));
      }
      
      toast({
        title: isAvailable ? "أنت متاح الآن 🟢" : "أنت غير متاح 🔴",
        description: isAvailable ? "ستتلقى طلبات جديدة" : "لن تتلقى طلبات جديدة",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في تحديث الحالة",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // تحديث موقع السائق
  const updateDriverLocation = async (lat: number, lng: number) => {
    if (!currentDriver?.id) return;
    
    try {
      await fetch(`/api/drivers/${currentDriver.id}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
    } catch (error) {
      console.error('خطأ في تحديث الموقع:', error);
    }
  };

  // مراقبة الطلبات الجديدة للإشعارات المحسنة
  useEffect(() => {
    if (availableOrders.length > 0 && driverStatus === 'available') {
      const latestOrderTime = Math.max(...availableOrders.map(order => 
        new Date(order.createdAt).getTime()
      ));
      
      if (latestOrderTime > lastNotificationTime) {
        setLastNotificationTime(latestOrderTime);
        
        // إشعار صوتي ومرئي محسن
        if (soundEnabled) {
          playNotificationSound('newOrder');
        }
        
        // إشعار المتصفح
        if ('Notification' in window && Notification.permission === 'granted') {
          const highPriorityOrders = availableOrders.filter(order => order.priority === 'high');
          const notificationTitle = highPriorityOrders.length > 0 ? 
            '🔥 طلب عالي الأولوية متاح!' : 
            '🔔 طلب جديد متاح!';
          
          new Notification(notificationTitle, {
            body: `يوجد ${availableOrders.length} طلب متاح للتوصيل`,
            icon: '/logo.png',
            tag: 'new-order',
            requireInteraction: true
          });
        }
        
        // اهتزاز الجهاز إذا كان مدعوماً
        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200]);
        }
        
        toast({
          title: "طلب جديد متاح! 🔔",
          description: `يوجد ${availableOrders.length} طلب جديد متاح للتوصيل`,
        });
      }
    }
  }, [availableOrders, driverStatus, lastNotificationTime, soundEnabled, toast]);

  // طلب إذن الإشعارات والموقع
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // تشغيل الأصوات
  const playNotificationSound = (type: 'newOrder' | 'success' | 'error' | 'delivery') => {
    if (!soundEnabled) return;
    
    try {
      const audio = new Audio();
      switch (type) {
        case 'newOrder':
          audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
          break;
        case 'success':
          audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
          break;
        default:
          return;
      }
      audio.play().catch(e => console.log('لا يمكن تشغيل الصوت:', e));
    } catch (error) {
      console.log('خطأ في تشغيل الصوت:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('driver_token');
    localStorage.removeItem('driver_user');
    onLogout();
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'في الانتظار',
      confirmed: 'مؤكد',
      preparing: 'قيد التحضير',
      ready: 'جاهز للاستلام',
      picked_up: 'تم الاستلام',
      on_way: 'في الطريق',
      delivered: 'تم التسليم',
      cancelled: 'ملغي'
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-orange-100 text-orange-800',
      ready: 'bg-purple-100 text-purple-800',
      picked_up: 'bg-indigo-100 text-indigo-800',
      on_way: 'bg-green-100 text-green-800',
      delivered: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  const getNextStatus = (currentStatus: string) => {
    const statusFlow: Record<string, string> = {
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'picked_up',
      picked_up: 'on_way',
      on_way: 'delivered'
    };
    return statusFlow[currentStatus];
  };

  const getNextStatusLabel = (currentStatus: string) => {
    const labels: Record<string, string> = {
      confirmed: 'بدء التحضير',
      preparing: 'جاهز للاستلام',
      ready: 'تم الاستلام',
      picked_up: 'في الطريق',
      on_way: 'تم التسليم'
    };
    return labels[currentStatus] || 'تحديث الحالة';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return '🔥';
      case 'medium': return '⚡';
      case 'low': return '🟢';
      default: return '📦';
    }
  };

  const getOrderItems = (itemsString: string) => {
    try {
      return JSON.parse(itemsString);
    } catch {
      return [];
    }
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${num.toFixed(2)} ريال`;
  };

  // فتح خرائط جوجل للمطعم
  const openRestaurantLocation = (order: OrderWithDetails) => {
    const restaurantLat = 15.3694; // موقع افتراضي لصنعاء
    const restaurantLng = 44.1910;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${restaurantLat},${restaurantLng}`;
    window.open(url, '_blank');
  };

  // فتح خرائط جوجل للعميل
  const openCustomerLocation = (order: OrderWithDetails) => {
    if (order.customerLocationLat && order.customerLocationLng) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${order.customerLocationLat},${order.customerLocationLng}`;
      window.open(url, '_blank');
    } else {
      const encodedAddress = encodeURIComponent(order.deliveryAddress);
      const url = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      window.open(url, '_blank');
    }
  };

  // عرض تفاصيل الطلب
  const handleShowOrderDetails = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setShowOrderDetailsDialog(true);
  };

  // تصنيف الطلبات حسب الحالة
  const categorizeOrders = (orders: OrderWithDetails[]) => {
    return {
      available: orders.filter(order => 
        order.status === 'confirmed' && !order.driverId
      ),
      accepted: orders.filter(order => 
        order.driverId === currentDriver?.id && 
        ['preparing', 'ready'].includes(order.status || '')
      ),
      inProgress: orders.filter(order => 
        order.driverId === currentDriver?.id && 
        ['picked_up', 'on_way'].includes(order.status || '')
      ),
      completed: orders.filter(order => 
        order.driverId === currentDriver?.id && 
        order.status === 'delivered'
      )
    };
  };

  const allOrders = [...availableOrders, ...myOrders];
  const categorizedOrders = categorizeOrders(allOrders);

  // مكون عرض الطلب المحسن
  const EnhancedOrderCard = ({ order, type }: { order: OrderWithDetails; type: 'available' | 'accepted' | 'inProgress' | 'completed' }) => {
    const items = getOrderItems(order.items);
    const totalAmount = parseFloat(order.totalAmount || '0');
    const estimatedEarnings = order.estimatedEarnings || Math.round(totalAmount * 0.15);

    return (
      <Card key={order.id} className={`hover:shadow-lg transition-all duration-200 ${
        order.priority === 'high' ? 'border-red-200 bg-red-50' : 
        order.priority === 'low' ? 'border-green-200 bg-green-50' : ''
      }`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-lg">طلب #{order.id.slice(0, 8)}</h4>
                {order.priority && (
                  <Badge className={`text-xs ${getPriorityColor(order.priority)}`}>
                    {getPriorityIcon(order.priority)} {order.priority === 'high' ? 'عالي' : order.priority === 'medium' ? 'متوسط' : 'منخفض'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{order.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(order.createdAt).toLocaleString('ar-YE')}
              </p>
              {order.distance && (
                <p className="text-xs text-blue-600">
                  📍 المسافة: {order.distance.toFixed(1)} كم
                </p>
              )}
            </div>
            <div className="text-left">
              <Badge className={getStatusColor(order.status || 'pending')}>
                {getStatusText(order.status || 'pending')}
              </Badge>
              <div className="mt-2">
                <p className="font-bold text-lg text-green-600">{formatCurrency(totalAmount)}</p>
                <p className="text-sm text-muted-foreground">عمولة: {formatCurrency(estimatedEarnings)}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* معلومات المطعم */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <h5 className="font-medium mb-2 flex items-center gap-2">
              <Store className="h-4 w-4" />
              معلومات المطعم
            </h5>
            <div className="space-y-1 text-sm">
              <p><strong>اسم المطعم:</strong> {order.restaurantName}</p>
              <p><strong>رقم الهاتف:</strong> {order.restaurantPhone}</p>
              <p><strong>العنوان:</strong> {order.restaurantAddress}</p>
            </div>
          </div>
          
          {/* معلومات العميل */}
          <div className="bg-green-50 p-3 rounded-lg">
            <h5 className="font-medium mb-2 flex items-center gap-2">
              <User className="h-4 w-4" />
              معلومات العميل
            </h5>
            <div className="space-y-1 text-sm">
              <p><strong>الاسم:</strong> {order.customerName}</p>
              <p><strong>الهاتف:</strong> {order.customerPhone}</p>
              <p><strong>العنوان:</strong> {order.deliveryAddress}</p>
              {order.notes && (
                <p><strong>ملاحظات:</strong> {order.notes}</p>
              )}
            </div>
          </div>
          
          {/* تفاصيل الطلب */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <h5 className="font-medium mb-2">تفاصيل الطلب</h5>
            <div className="space-y-1">
              {items.slice(0, 3).map((item: any, index: number) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{item.name} × {item.quantity}</span>
                  <span>{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
              {items.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  و {items.length - 3} عنصر آخر...
                </p>
              )}
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between font-medium">
                  <span>المجموع:</span>
                  <span className="text-green-600">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>عمولتك:</span>
                  <span className="text-green-600">{formatCurrency(estimatedEarnings)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* أزرار الإجراءات */}
          <div className="flex gap-2">
            {type === 'available' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleShowOrderDetails(order)}
                  className="gap-2"
                  data-testid={`view-details-${order.id}`}
                >
                  <Eye className="h-4 w-4" />
                  التفاصيل
                </Button>
                <Button
                  onClick={() => acceptOrderMutation.mutate(order.id)}
                  disabled={acceptOrderMutation.isPending}
                  className={`flex-1 ${order.priority === 'high' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
                  data-testid={`accept-order-${order.id}`}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {order.priority === 'high' ? 'قبول فوري' : 'قبول الطلب'}
                </Button>
              </>
            )}

            {(type === 'accepted' || type === 'inProgress') && (
              <>
                <Button
                  variant="outline"
                  onClick={() => openRestaurantLocation(order)}
                  className="gap-2"
                  data-testid={`restaurant-location-${order.id}`}
                >
                  <Store className="h-4 w-4" />
                  المطعم
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => window.open(`tel:${order.customerPhone}`)}
                  className="gap-2"
                  data-testid={`call-customer-${order.id}`}
                >
                  <Phone className="h-4 w-4" />
                  اتصال
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => openCustomerLocation(order)}
                  className="gap-2"
                  data-testid={`navigate-${order.id}`}
                >
                  <Navigation className="h-4 w-4" />
                  التنقل
                </Button>

                {getNextStatus(order.status || '') && (
                  <Button
                    onClick={() => updateOrderStatusMutation.mutate({ 
                      orderId: order.id, 
                      status: getNextStatus(order.status || '') 
                    })}
                    disabled={updateOrderStatusMutation.isPending}
                    className="flex-1"
                    data-testid={`update-status-${order.id}`}
                  >
                    {getNextStatusLabel(order.status || '')}
                  </Button>
                )}
              </>
            )}

            {type === 'completed' && (
              <div className="flex-1 text-center">
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  مكتمل
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header محسن */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <Truck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">تطبيق السائق المحسن</h1>
                <p className="text-sm text-gray-500">مرحباً {currentDriver?.name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* مؤشر الطلبات الجديدة */}
              {categorizedOrders.available.length > 0 && driverStatus === 'available' && (
                <div className="flex items-center gap-2 bg-red-50 px-3 py-1 rounded-full animate-pulse">
                  <Bell className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">
                    {categorizedOrders.available.length} طلب جديد
                  </span>
                </div>
              )}

              {/* إعدادات سريعة */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={autoRefresh ? 'text-green-600' : 'text-gray-400'}
                >
                  <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={soundEnabled ? 'text-blue-600' : 'text-gray-400'}
                >
                  <Bell className="h-4 w-4" />
                </Button>
              </div>

              {/* حالة السائق */}
              <div className="flex items-center gap-2">
                <Label htmlFor="driver-status" className="text-sm">متاح للعمل</Label>
                <Switch
                  id="driver-status"
                  checked={driverStatus === 'available'}
                  onCheckedChange={(checked) => updateDriverStatusMutation.mutate(checked)}
                  disabled={updateDriverStatusMutation.isPending}
                  data-testid="driver-status-toggle"
                />
              </div>

              <Button 
                variant="outline" 
                onClick={handleLogout}
                className="flex items-center gap-2"
                data-testid="logout-button"
              >
                <LogOut className="h-4 w-4" />
                خروج
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* إحصائيات سريعة محسنة */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4 text-center">
              <Package className="h-6 w-6 mx-auto mb-2" />
              <p className="text-lg font-bold">{driverStats?.todayOrders || 0}</p>
              <p className="text-xs opacity-90">طلبات اليوم</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-6 w-6 mx-auto mb-2" />
              <p className="text-lg font-bold">{formatCurrency(driverStats?.todayEarnings || 0)}</p>
              <p className="text-xs opacity-90">أرباح اليوم</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4 text-center">
              <Target className="h-6 w-6 mx-auto mb-2" />
              <p className="text-lg font-bold">{driverStats?.successRate || 0}%</p>
              <p className="text-xs opacity-90">معدل النجاح</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4 text-center">
              <Activity className="h-6 w-6 mx-auto mb-2" />
              <p className="text-lg font-bold">
                {driverStatus === 'available' ? '🟢 متاح' : 
                 driverStatus === 'busy' ? '🟡 مشغول' : '🔴 غير متاح'}
              </p>
              <p className="text-xs opacity-90">الحالة الحالية</p>
            </CardContent>
          </Card>
        </div>

        {/* تحذيرات وتنبيهات */}
        {driverStatus === 'offline' && (
          <Alert className="mb-6 border-yellow-200 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              أنت غير متاح حالياً. قم بتفعيل حالة "متاح للعمل" لاستقبال الطلبات الجديدة.
            </AlertDescription>
          </Alert>
        )}

        {/* التبويبات المحسنة */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard" className="relative">
              الرئيسية
            </TabsTrigger>
            <TabsTrigger value="available" className="relative">
              الطلبات المتاحة
              {categorizedOrders.available.length > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs h-5 w-5 rounded-full p-0 flex items-center justify-center">
                  {categorizedOrders.available.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted" className="relative">
              طلباتي المقبولة
              {categorizedOrders.accepted.length > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs h-5 w-5 rounded-full p-0 flex items-center justify-center">
                  {categorizedOrders.accepted.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="inProgress" className="relative">
              قيد التوصيل
              {categorizedOrders.inProgress.length > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs h-5 w-5 rounded-full p-0 flex items-center justify-center">
                  {categorizedOrders.inProgress.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats">
              الإحصائيات
            </TabsTrigger>
          </TabsList>

          {/* لوحة المعلومات الرئيسية */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* الطلب الحالي */}
            {categorizedOrders.inProgress.length > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800">
                    <Zap className="h-5 w-5" />
                    الطلب النشط - #{categorizedOrders.inProgress[0].id.slice(0, 8)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DriverCommunication 
                    driver={{
                      id: currentDriver?.id || '',
                      name: currentDriver?.name || '',
                      phone: currentDriver?.phone || '',
                      isAvailable: currentDriver?.isAvailable || false
                    }}
                    orderNumber={categorizedOrders.inProgress[0].id.slice(0, 8)}
                    customerLocation={categorizedOrders.inProgress[0].deliveryAddress}
                  />
                </CardContent>
              </Card>
            )}

            {/* ملخص سريع للطلبات */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">طلبات متاحة</p>
                      <p className="text-2xl font-bold text-blue-600">{categorizedOrders.available.length}</p>
                    </div>
                    <Bell className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">قيد التوصيل</p>
                      <p className="text-2xl font-bold text-orange-600">{categorizedOrders.inProgress.length}</p>
                    </div>
                    <Route className="h-8 w-8 text-orange-500" />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">مكتملة اليوم</p>
                      <p className="text-2xl font-bold text-green-600">{driverStats?.todayOrders || 0}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* الطلبات المتاحة */}
          <TabsContent value="available" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">الطلبات المتاحة ({categorizedOrders.available.length})</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchAvailable()}
                  disabled={availableLoading}
                  data-testid="refresh-available-orders"
                >
                  <RefreshCw className={`h-4 w-4 ${availableLoading ? 'animate-spin' : ''}`} />
                  تحديث
                </Button>
                <Badge variant="secondary">
                  تحديث تلقائي: {autoRefresh ? 'مفعل' : 'معطل'}
                </Badge>
              </div>
            </div>

            {driverStatus !== 'available' && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  يجب تفعيل حالة "متاح للعمل" لرؤية الطلبات الجديدة
                </AlertDescription>
              </Alert>
            )}

            {availableLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                      <div className="h-3 bg-gray-200 rounded w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : categorizedOrders.available.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد طلبات متاحة</h3>
                  <p className="text-muted-foreground">سيتم إشعارك عند توفر طلبات جديدة</p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-green-600">في انتظار الطلبات...</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {categorizedOrders.available.map(order => (
                  <EnhancedOrderCard key={order.id} order={order} type="available" />
                ))}
              </div>
            )}
          </TabsContent>

          {/* الطلبات المقبولة */}
          <TabsContent value="accepted" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">طلباتي المقبولة ({categorizedOrders.accepted.length})</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchMyOrders()}
                disabled={myOrdersLoading}
              >
                <RefreshCw className={`h-4 w-4 ${myOrdersLoading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>

            {categorizedOrders.accepted.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد طلبات مقبولة</h3>
                  <p className="text-muted-foreground">الطلبات التي تقبلها ستظهر هنا</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {categorizedOrders.accepted.map(order => (
                  <EnhancedOrderCard key={order.id} order={order} type="accepted" />
                ))}
              </div>
            )}
          </TabsContent>

          {/* الطلبات قيد التوصيل */}
          <TabsContent value="inProgress" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">قيد التوصيل ({categorizedOrders.inProgress.length})</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchMyOrders()}
                disabled={myOrdersLoading}
              >
                <RefreshCw className={`h-4 w-4 ${myOrdersLoading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>

            {categorizedOrders.inProgress.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Navigation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">لا توجد طلبات قيد التوصيل</h3>
                  <p className="text-muted-foreground">الطلبات التي تقوم بتوصيلها ستظهر هنا</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {categorizedOrders.inProgress.map(order => (
                  <EnhancedOrderCard key={order.id} order={order} type="inProgress" />
                ))}
              </div>
            )}
          </TabsContent>

          {/* الإحصائيات المحسنة */}
          <TabsContent value="stats" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* إحصائيات اليوم */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    إحصائيات اليوم
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>الطلبات:</span>
                    <span className="font-bold">{driverStats?.todayOrders || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الأرباح:</span>
                    <span className="font-bold text-green-600">{formatCurrency(driverStats?.todayEarnings || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>متوسط الطلب:</span>
                    <span className="font-bold">
                      {driverStats?.todayOrders ? 
                        formatCurrency((driverStats.todayEarnings || 0) / driverStats.todayOrders) : 
                        formatCurrency(0)
                      }
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* إحصائيات الأسبوع */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    إحصائيات الأسبوع
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>الطلبات:</span>
                    <span className="font-bold">{driverStats?.weeklyOrders || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الأرباح:</span>
                    <span className="font-bold text-green-600">{formatCurrency(driverStats?.weeklyEarnings || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>معدل النجاح:</span>
                    <span className="font-bold">{driverStats?.successRate || 0}%</span>
                  </div>
                </CardContent>
              </Card>

              {/* إحصائيات الأداء */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    إحصائيات الأداء
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>التقييم:</span>
                    <span className="font-bold text-yellow-600">{driverStats?.averageRating || 0} ⭐</span>
                  </div>
                  <div className="flex justify-between">
                    <span>متوسط التوصيل:</span>
                    <span className="font-bold">{driverStats?.averageDeliveryTime || 0} دقيقة</span>
                  </div>
                  <div className="flex justify-between">
                    <span>إجمالي الطلبات:</span>
                    <span className="font-bold">{driverStats?.totalOrders || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* رسم بياني للأرباح */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  تطور الأرباح
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>اليوم</span>
                    <div className="flex items-center gap-2">
                      <Progress value={(driverStats?.todayEarnings || 0) / 500 * 100} className="w-32" />
                      <span className="font-bold">{formatCurrency(driverStats?.todayEarnings || 0)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>هذا الأسبوع</span>
                    <div className="flex items-center gap-2">
                      <Progress value={(driverStats?.weeklyEarnings || 0) / 2000 * 100} className="w-32" />
                      <span className="font-bold">{formatCurrency(driverStats?.weeklyEarnings || 0)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>هذا الشهر</span>
                    <div className="flex items-center gap-2">
                      <Progress value={(driverStats?.monthlyEarnings || 0) / 8000 * 100} className="w-32" />
                      <span className="font-bold">{formatCurrency(driverStats?.monthlyEarnings || 0)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* نافذة تفاصيل الطلب المحسنة */}
      <Dialog open={showOrderDetailsDialog} onOpenChange={setShowOrderDetailsDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب #{selectedOrder?.id?.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4">
              {/* معلومات المطعم */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Store className="h-4 w-4" />
                    معلومات المطعم
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>اسم المطعم:</strong> {selectedOrder.restaurantName}</p>
                    <p><strong>رقم الهاتف:</strong> {selectedOrder.restaurantPhone}</p>
                    <p><strong>العنوان:</strong> {selectedOrder.restaurantAddress}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRestaurantLocation(selectedOrder)}
                      className="w-full mt-2"
                    >
                      <Map className="h-4 w-4 mr-2" />
                      عرض موقع المطعم على الخريطة
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              {/* معلومات العميل */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    معلومات العميل
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>الاسم:</strong> {selectedOrder.customerName}</p>
                    <p><strong>الهاتف:</strong> {selectedOrder.customerPhone}</p>
                    <p><strong>العنوان:</strong> {selectedOrder.deliveryAddress}</p>
                    {selectedOrder.notes && (
                      <p><strong>ملاحظات:</strong> {selectedOrder.notes}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`tel:${selectedOrder.customerPhone}`)}
                        className="flex-1"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        اتصال
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCustomerLocation(selectedOrder)}
                        className="flex-1"
                      >
                        <Navigation className="h-4 w-4 mr-2" />
                        التوجيه
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* تفاصيل الطلب */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-2">تفاصيل الطلب</h4>
                  <div className="space-y-2">
                    {getOrderItems(selectedOrder.items).map((item: any, index: number) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{item.name} × {item.quantity}</span>
                        <span>{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between font-medium">
                        <span>المجموع:</span>
                        <span className="text-green-600">{formatCurrency(selectedOrder.totalAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>عمولتك:</span>
                        <span className="text-green-600">{formatCurrency(selectedOrder.estimatedEarnings || 0)}</span>
                      </div>
                      {selectedOrder.distance && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>المسافة:</span>
                          <span>{selectedOrder.distance.toFixed(1)} كم</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};