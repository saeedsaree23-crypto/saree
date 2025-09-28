import express from "express";
import { storage } from "../storage";
import { z } from "zod";
import { randomUUID } from "crypto";

const router = express.Router();

// تم حذف middleware المصادقة للسائق - الوصول مباشر للبيانات بدون مصادقة
// الآن يتم تمرير driverId كمعامل في الطلبات

// لوحة معلومات السائق
router.get("/dashboard", async (req, res) => {
  try {
    const { driverId } = req.query;
    
    if (!driverId || typeof driverId !== 'string') {
      return res.status(400).json({ error: "معرف السائق مطلوب" });
    }

    // التحقق من وجود السائق
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "السائق غير موجود" });
    }

    // جلب جميع الطلبات وفلترتها
    const allOrders = await storage.getOrders();
    const driverOrders = allOrders.filter(order => order.driverId === driverId);
    
    // حساب الإحصائيات
    const today = new Date().toDateString();
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date();
    thisMonth.setMonth(thisMonth.getMonth() - 1);
    
    const todayOrders = driverOrders.filter(order => 
      order.createdAt.toDateString() === today
    );
    const weeklyOrders = driverOrders.filter(order => 
      order.createdAt >= thisWeek
    );
    const monthlyOrders = driverOrders.filter(order => 
      order.createdAt >= thisMonth
    );
    
    const completedToday = todayOrders.filter(order => order.status === "delivered");
    const completedWeekly = weeklyOrders.filter(order => order.status === "delivered");
    const completedMonthly = monthlyOrders.filter(order => order.status === "delivered");
    const totalCompleted = driverOrders.filter(order => order.status === "delivered");
    const totalCancelled = driverOrders.filter(order => order.status === "cancelled");
    
    const totalEarnings = driverOrders
      .filter(order => order.status === "delivered")
      .reduce((sum, order) => sum + parseFloat(order.driverEarnings || "0"), 0);
    const todayEarnings = completedToday
      .reduce((sum, order) => sum + parseFloat(order.driverEarnings || "0"), 0);
    const weeklyEarnings = completedWeekly
      .reduce((sum, order) => sum + parseFloat(order.driverEarnings || "0"), 0);
    const monthlyEarnings = completedMonthly
      .reduce((sum, order) => sum + parseFloat(order.driverEarnings || "0"), 0);

    // الطلبات المتاحة (غير مُعيَّنة لسائق)
    const availableOrders = allOrders
      .filter(order => order.status === "confirmed" && !order.driverId)
      .map(order => {
        const totalAmount = parseFloat(order.totalAmount || '0');
        const estimatedEarnings = Math.round(totalAmount * 0.15);
        const orderAge = Date.now() - new Date(order.createdAt).getTime();
        const ageInMinutes = orderAge / (1000 * 60);
        
        // تحديد أولوية الطلب
        let priority: 'high' | 'medium' | 'low' = 'medium';
        if (totalAmount > 100 || ageInMinutes > 15) {
          priority = 'high';
        } else if (totalAmount < 50 && ageInMinutes < 5) {
          priority = 'low';
        }
        
        return {
          ...order,
          estimatedEarnings,
          priority,
          ageInMinutes: Math.round(ageInMinutes)
        };
      })
      .sort((a, b) => {
        // ترتيب حسب الأولوية ثم الوقت
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .slice(0, 10);

    // الطلبات الحالية للسائق
    const currentOrders = driverOrders.filter(order => 
      ["preparing", "ready", "picked_up", "on_way"].includes(order.status || "")
    );

    // حساب متوسط وقت التوصيل
    const deliveredOrdersWithTime = totalCompleted.filter(order => 
      order.acceptedAt && order.deliveredAt
    );
    const averageDeliveryTime = deliveredOrdersWithTime.length > 0 ?
      deliveredOrdersWithTime.reduce((sum, order) => {
        const acceptedTime = new Date(order.acceptedAt!).getTime();
        const deliveredTime = new Date(order.deliveredAt!).getTime();
        return sum + (deliveredTime - acceptedTime);
      }, 0) / deliveredOrdersWithTime.length / (1000 * 60) : 0; // في الدقائق

    // حساب معدل النجاح
    const successRate = driverOrders.length > 0 ? 
      Math.round((totalCompleted.length / driverOrders.length) * 100) : 0;
    res.json({
      stats: {
        todayOrders: todayOrders.length,
        todayEarnings,
        weeklyOrders: weeklyOrders.length,
        weeklyEarnings,
        monthlyOrders: monthlyOrders.length,
        monthlyEarnings,
        completedToday: completedToday.length,
        totalOrders: driverOrders.length,
        totalEarnings,
        completedOrders: totalCompleted.length,
        cancelledOrders: totalCancelled.length,
        averageRating: 4.8, // قيمة افتراضية حتى يتم تنفيذ نظام التقييم
        averageDeliveryTime: Math.round(averageDeliveryTime),
        successRate
      },
      availableOrders,
      currentOrders,
      driverLocation: driver.currentLocation,
      lastActiveAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("خطأ في لوحة معلومات السائق:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// قبول طلب
router.post("/orders/:id/accept", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;
    
    if (!driverId) {
      return res.status(400).json({ error: "معرف السائق مطلوب" });
    }

    // التحقق من وجود السائق
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "السائق غير موجود" });
    }

    // جلب الطلب
    const order = await storage.getOrder(id);
    if (!order) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    // التحقق من إمكانية قبول الطلب
    if (order.status !== "confirmed" || order.driverId) {
      return res.status(400).json({ error: "لا يمكن قبول هذا الطلب" });
    }

    // تحديث الطلب
    const updatedOrder = await storage.updateOrder(id, {
      driverId,
      status: "ready",
      driverEarnings: "10.00" // قيمة افتراضية
    });

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("خطأ في قبول الطلب:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// تحديث حالة الطلب
router.put("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId, status, location } = req.body;
    
    if (!driverId || !status) {
      return res.status(400).json({ error: "معرف السائق والحالة مطلوبان" });
    }

    // جلب الطلب والتحقق من صلاحية السائق
    const order = await storage.getOrder(id);
    if (!order) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    if (order.driverId !== driverId) {
      return res.status(403).json({ error: "غير مصرح بتحديث هذا الطلب" });
    }

    // التحقق من الحالات المسموحة
    const allowedStatuses = ["ready", "picked_up", "delivered"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "حالة غير صحيحة" });
    }

    // إعداد بيانات التحديث
    const updateData: any = { status };
    if (status === "delivered") {
      updateData.actualDeliveryTime = new Date();
    }

    const updatedOrder = await storage.updateOrder(id, updateData);
    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("خطأ في تحديث حالة الطلب:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// جلب تفاصيل طلب محدد
router.get("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverId } = req.query;
    
    if (!driverId || typeof driverId !== 'string') {
      return res.status(400).json({ error: "معرف السائق مطلوب" });
    }

    const order = await storage.getOrder(id);
    if (!order) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    // التحقق من صلاحية السائق
    if (order.driverId !== driverId) {
      return res.status(403).json({ error: "غير مصرح بعرض هذا الطلب" });
    }

    res.json(order);
  } catch (error) {
    console.error("خطأ في جلب تفاصيل الطلب:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// جلب طلبات السائق
router.get("/orders", async (req, res) => {
  try {
    const { driverId, status } = req.query;
    
    if (!driverId || typeof driverId !== 'string') {
      return res.status(400).json({ error: "معرف السائق مطلوب" });
    }

    // جلب جميع الطلبات وفلترتها
    const allOrders = await storage.getOrders();
    let driverOrders = allOrders.filter(order => order.driverId === driverId);
    
    // فلترة حسب الحالة إذا تم توفيرها
    if (status && typeof status === 'string') {
      driverOrders = driverOrders.filter(order => order.status === status);
    }
    
    // ترتيب حسب تاريخ الإنشاء
    driverOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json(driverOrders);
  } catch (error) {
    console.error("خطأ في جلب طلبات السائق:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// إحصائيات السائق
router.get("/stats", async (req, res) => {
  try {
    const { driverId, period = 'today' } = req.query;
    
    if (!driverId || typeof driverId !== 'string') {
      return res.status(400).json({ error: "معرف السائق مطلوب" });
    }

    // التحقق من وجود السائق
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      return res.status(404).json({ error: "السائق غير موجود" });
    }

    // جلب طلبات السائق
    const allOrders = await storage.getOrders();
    const driverOrders = allOrders.filter(order => order.driverId === driverId);
    
    // تحديد الفترة الزمنية
    let startDate: Date;
    const endDate = new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'total':
      default:
        startDate = new Date(0); // من البداية
        break;
    }
    
    // فلترة الطلبات حسب الفترة
    const periodOrders = driverOrders.filter(order => 
      order.createdAt >= startDate && order.createdAt <= endDate
    );
    const deliveredOrders = periodOrders.filter(order => order.status === "delivered");
    const cancelledOrders = periodOrders.filter(order => order.status === "cancelled");
    
    // حساب الإحصائيات المحسنة
    const totalEarnings = deliveredOrders.reduce((sum, order) => 
      sum + parseFloat(order.driverEarnings || "0"), 0
    );
    
    // حساب متوسط قيمة الطلب
    const avgOrderValue = deliveredOrders.length > 0 ? 
      totalEarnings / deliveredOrders.length : 0;
    
    // حساب معدل النجاح
    const successRate = periodOrders.length > 0 ? 
      Math.round((deliveredOrders.length / periodOrders.length) * 100) : 0;

    res.json({
      totalOrders: periodOrders.length,
      completedOrders: deliveredOrders.length,
      cancelledOrders: cancelledOrders.length,
      totalEarnings,
      avgOrderValue,
      averageRating: 4.8, // قيمة افتراضية
      successRate,
      period,
      startDate,
      endDate
    });
  } catch (error) {
    console.error("خطأ في جلب إحصائيات السائق:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// تحديث الملف الشخصي
router.put("/profile", async (req, res) => {
  try {
    const { driverId, ...updateData } = req.body;
    
    if (!driverId) {
      return res.status(400).json({ error: "معرف السائق مطلوب" });
    }

    // إزالة أي حقول غير مسموحة
    const allowedFields = ['name', 'phone', 'email', 'currentLocation', 'isAvailable'];
    const sanitizedData: any = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        sanitizedData[field] = updateData[field];
      }
    }

    const updatedDriver = await storage.updateDriver(driverId, sanitizedData);
    
    if (!updatedDriver) {
      return res.status(404).json({ error: "السائق غير موجود" });
    }

    res.json({ success: true, driver: updatedDriver });
  } catch (error) {
    console.error("خطأ في تحديث الملف الشخصي:", error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;