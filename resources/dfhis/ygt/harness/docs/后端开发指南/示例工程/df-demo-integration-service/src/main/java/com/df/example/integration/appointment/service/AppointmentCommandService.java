package com.df.example.integration.appointment.service;

import com.df.example.integration.appointment.dto.AppointmentCreatedResponse;
import com.df.example.integration.appointment.dto.CreateAppointmentRequest;
import com.df.example.integration.appointment.event.AppointmentCreatedEvent;
import com.df.message.support.MessagePublishTemplate;
import com.df.redis.support.RedisLockUtil;
import com.df.redis.support.RedisUtil;
import com.df.tenant.context.TenantContext;
import com.df.utility.error.CommonErrorCode;
import com.df.utility.exception.BusinessException;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class AppointmentCommandService {

    private static final long APPOINTMENT_CACHE_TTL_SECONDS = 1800L;

    private final MessagePublishTemplate messagePublishTemplate;
    private final String exchange;
    private final String routingKey;

    public AppointmentCommandService(MessagePublishTemplate messagePublishTemplate,
                                     @Value("${demo.messaging.exchange:df.demo.exchange}") String exchange,
                                     @Value("${demo.messaging.routing-key:appointment.created}") String routingKey) {
        this.messagePublishTemplate = messagePublishTemplate;
        this.exchange = exchange;
        this.routingKey = routingKey;
    }

    public AppointmentCreatedResponse createAppointment(CreateAppointmentRequest request) {
        String tenantId = requireTenantId();
        String lockKey = buildLockKey(tenantId, request.getScheduleCode(), request.getPatientIdCard());
        try {
            return RedisLockUtil.executeWithLock(lockKey, Duration.ofSeconds(10),
                    () -> createWithinLock(request, tenantId, lockKey));
        } catch (BusinessException exception) {
            throw exception;
        } catch (IllegalStateException exception) {
            throw new BusinessException(CommonErrorCode.DISTRIBUTED_LOCK_ERROR,
                    "预约创建失败，未能获取分布式锁", exception.getMessage());
        }
    }

    private AppointmentCreatedResponse createWithinLock(CreateAppointmentRequest request,
                                                        String tenantId,
                                                        String lockKey) {
        String appointmentNo = UUID.randomUUID().toString().replace("-", "");
        String createdAt = Instant.now().toString();
        AppointmentCreatedEvent event = new AppointmentCreatedEvent(
                appointmentNo,
                tenantId,
                request.getPatientName(),
                request.getPatientIdCard(),
                request.getScheduleCode(),
                createdAt);

        try {
            messagePublishTemplate.publish(exchange, routingKey, event);
        } catch (RuntimeException exception) {
            throw new BusinessException(CommonErrorCode.MESSAGE_PUBLISH_ERROR,
                    "预约创建成功，但事件投递失败", exception.getMessage());
        }

        String cacheKey = buildCacheKey(tenantId, appointmentNo);
        cacheAppointmentResult(cacheKey, appointmentNo, tenantId, request.getPatientName(), request.getScheduleCode(), lockKey);
        return buildResponse(appointmentNo, tenantId, request.getPatientName(), request.getScheduleCode(), lockKey, cacheKey);
    }

    public AppointmentCreatedResponse getAppointmentCache(String appointmentNo) {
        String tenantId = requireTenantId();
        String cacheKey = buildCacheKey(tenantId, appointmentNo);
        Map<Object, Object> cacheData;
        try {
            cacheData = RedisUtil.hmGet(cacheKey);
        } catch (RuntimeException exception) {
            throw new BusinessException(CommonErrorCode.CACHE_ERROR,
                    "预约缓存读取失败", exception.getMessage());
        }
        if (cacheData == null || cacheData.isEmpty()) {
            throw new BusinessException(CommonErrorCode.NOT_FOUND, "预约缓存不存在或已过期");
        }
        return buildResponse(
                readString(cacheData, "appointmentNo"),
                readString(cacheData, "tenantId"),
                readString(cacheData, "patientName"),
                readString(cacheData, "scheduleCode"),
                readString(cacheData, "lockKey"),
                cacheKey);
    }

    private String buildLockKey(String tenantId, String scheduleCode, String patientIdCard) {
        return "appointment:create:" + tenantId + ":" + scheduleCode + ":" + patientIdCard;
    }

    private String buildCacheKey(String tenantId, String appointmentNo) {
        return "appointment:result:" + tenantId + ":" + appointmentNo;
    }

    private void cacheAppointmentResult(String cacheKey,
                                        String appointmentNo,
                                        String tenantId,
                                        String patientName,
                                        String scheduleCode,
                                        String lockKey) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("appointmentNo", appointmentNo);
        payload.put("tenantId", tenantId);
        payload.put("patientName", patientName);
        payload.put("scheduleCode", scheduleCode);
        payload.put("lockKey", lockKey);
        payload.put("exchange", exchange);
        payload.put("routingKey", routingKey);
        try {
            RedisUtil.hmSet(cacheKey, payload, APPOINTMENT_CACHE_TTL_SECONDS);
        } catch (RuntimeException exception) {
            throw new BusinessException(CommonErrorCode.CACHE_ERROR,
                    "预约缓存写入失败", exception.getMessage());
        }
    }

    private AppointmentCreatedResponse buildResponse(String appointmentNo,
                                                     String tenantId,
                                                     String patientName,
                                                     String scheduleCode,
                                                     String lockKey,
                                                     String cacheKey) {
        AppointmentCreatedResponse response = new AppointmentCreatedResponse();
        response.setAppointmentNo(appointmentNo);
        response.setTenantId(tenantId);
        response.setPatientName(patientName);
        response.setScheduleCode(scheduleCode);
        response.setLockKey(lockKey);
        response.setCacheKey(cacheKey);
        response.setCacheExpireSeconds(readExpire(cacheKey));
        response.setExchange(exchange);
        response.setRoutingKey(routingKey);
        return response;
    }

    private long readExpire(String cacheKey) {
        try {
            return RedisUtil.getExpire(cacheKey);
        } catch (RuntimeException exception) {
            throw new BusinessException(CommonErrorCode.CACHE_ERROR,
                    "预约缓存剩余时间读取失败", exception.getMessage());
        }
    }

    private String readString(Map<Object, Object> cacheData, String field) {
        Object value = cacheData.get(field);
        return value == null ? null : String.valueOf(value);
    }

    private String requireTenantId() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(CommonErrorCode.TENANT_MISSING, "缺少租户信息");
        }
        return tenantId;
    }
}