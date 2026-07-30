package com.df.example.integration.appointment;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.df.example.integration.appointment.event.AppointmentCreatedEvent;
import com.df.utility.context.RequestContextHolder;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = {
    "spring.autoconfigure.exclude="
            + "org.springframework.boot.amqp.autoconfigure.RabbitAutoConfiguration,"
            + "org.springframework.boot.data.redis.autoconfigure.RedisAutoConfiguration,"
            + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
            + "org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration,"
            + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
            + "com.df.jpa.autoconfigure.DfJpaAutoConfiguration,"
            + "com.infobip.spring.data.common.InfobipSpringDataCommonConfiguration,"
            + "com.infobip.spring.data.jpa.QuerydslJpaRepositoriesAutoConfiguration,"
            + "org.redisson.spring.starter.RedissonAutoConfigurationV2,"
            + "org.redisson.spring.starter.RedissonAutoConfigurationV4"
})
class AppointmentControllerTest {

    private MockMvc mockMvc;
    private RLock lock;
    private HashOperations<Object, Object, Object> hashOperations;
    private final Map<String, Map<Object, Object>> hashStore = new LinkedHashMap<>();
    private final Map<String, Long> expireStore = new LinkedHashMap<>();

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private RedisTemplate<Object, Object> redisTemplate;

    @BeforeEach
    void setUp() throws InterruptedException {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
        reset(redissonClient, rabbitTemplate, redisTemplate);
        hashStore.clear();
        expireStore.clear();
        lock = mock(RLock.class);
        hashOperations = mock(HashOperations.class);
        when(redissonClient.getLock(anyString())).thenReturn(lock);
        when(lock.tryLock(eq(0L), anyLong(), eq(TimeUnit.MILLISECONDS))).thenReturn(true);
        when(lock.isHeldByCurrentThread()).thenReturn(true);
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.expire(anyString(), anyLong(), eq(TimeUnit.SECONDS))).thenAnswer(invocation -> {
            expireStore.put(invocation.getArgument(0), invocation.getArgument(1));
            return true;
        });
        when(redisTemplate.getExpire(anyString(), eq(TimeUnit.SECONDS))).thenAnswer(invocation -> {
            String key = invocation.getArgument(0);
            return expireStore.getOrDefault(key, 0L);
        });
        when(hashOperations.entries(anyString())).thenAnswer(invocation -> {
            String key = invocation.getArgument(0);
            return hashStore.getOrDefault(key, Map.of());
        });
        org.mockito.Mockito.doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            Map<?, ?> values = invocation.getArgument(1);
            hashStore.put(key, new LinkedHashMap<>(values));
            return null;
        }).when(hashOperations).putAll(anyString(), org.mockito.ArgumentMatchers.anyMap());
    }

    @Test
    void shouldCreateAppointmentWithinDistributedLock() throws Exception {
        mockMvc.perform(post("/api/appointments")
                        .header(RequestContextHolder.HEADER_TENANT_ID, "0")
                        .contentType("application/json")
                        .content("""
                                {
                                                                    "patientName": "张三",
                                                                    "patientIdCard": "320101199001011234",
                                                                    "scheduleCode": "SCH-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.tenantId").value("0"))
                .andExpect(jsonPath("$.data.patientName").value("张三"))
                .andExpect(jsonPath("$.data.scheduleCode").value("SCH-001"))
                .andExpect(jsonPath("$.data.lockKey").value("appointment:create:0:SCH-001:320101199001011234"))
                .andExpect(jsonPath("$.data.cacheKey").value(org.hamcrest.Matchers.startsWith("appointment:result:0:")))
                .andExpect(jsonPath("$.data.cacheExpireSeconds").value(1800))
                .andExpect(jsonPath("$.data.exchange").value("df.demo.exchange"))
                .andExpect(jsonPath("$.data.routingKey").value("appointment.created"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        verify(redissonClient).getLock("appointment:create:0:SCH-001:320101199001011234");
        ArgumentCaptor<AppointmentCreatedEvent> payloadCaptor = ArgumentCaptor.forClass(AppointmentCreatedEvent.class);
        verify(rabbitTemplate).convertAndSend(eq("df.demo.exchange"), eq("appointment.created"), payloadCaptor.capture());
        AppointmentCreatedEvent event = payloadCaptor.getValue();
        org.assertj.core.api.Assertions.assertThat(event.getTenantId()).isEqualTo("0");
        org.assertj.core.api.Assertions.assertThat(event.getPatientName()).isEqualTo("张三");
        org.assertj.core.api.Assertions.assertThat(event.getScheduleCode()).isEqualTo("SCH-001");
        org.assertj.core.api.Assertions.assertThat(hashStore).hasSize(1);
        org.assertj.core.api.Assertions.assertThat(expireStore.values()).containsExactly(1800L);
    }

    @Test
    void shouldReadAppointmentCache() throws Exception {
        String cacheKey = "appointment:result:0:APPOINTMENT-001";
        Map<Object, Object> cached = new LinkedHashMap<>();
        cached.put("appointmentNo", "APPOINTMENT-001");
        cached.put("tenantId", "0");
        cached.put("patientName", "张三");
        cached.put("scheduleCode", "SCH-001");
        cached.put("lockKey", "appointment:create:0:SCH-001:320101199001011234");
        cached.put("exchange", "df.demo.exchange");
        cached.put("routingKey", "appointment.created");
        hashStore.put(cacheKey, cached);
        expireStore.put(cacheKey, 1800L);

        mockMvc.perform(get("/api/appointments/APPOINTMENT-001/cache")
                        .header(RequestContextHolder.HEADER_TENANT_ID, "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.appointmentNo").value("APPOINTMENT-001"))
                .andExpect(jsonPath("$.data.patientName").value("张三"))
                .andExpect(jsonPath("$.data.scheduleCode").value("SCH-001"))
                .andExpect(jsonPath("$.data.cacheKey").value(cacheKey))
                .andExpect(jsonPath("$.data.cacheExpireSeconds").value(1800));
    }

    @Test
    void shouldReturnNotFoundWhenAppointmentCacheMissing() throws Exception {
        mockMvc.perform(get("/api/appointments/APPOINTMENT-404/cache")
                        .header(RequestContextHolder.HEADER_TENANT_ID, "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(404000))
                .andExpect(jsonPath("$.msg").value("预约缓存不存在或已过期"));
    }

    @Test
    void shouldRejectMissingTenantHeader() throws Exception {
        mockMvc.perform(post("/api/appointments")
                        .contentType("application/json")
                        .content("""
                                {
                                                                    "patientName": "张三",
                                                                    "patientIdCard": "320101199001011234",
                                                                    "scheduleCode": "SCH-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403101));

        verifyNoInteractions(redissonClient, rabbitTemplate);
    }

    @Test
    void shouldConvertPublishFailureToBusinessError() throws Exception {
        doThrow(new AmqpException("publish failed"))
                .when(rabbitTemplate)
            .convertAndSend(eq("df.demo.exchange"), eq("appointment.created"), any(AppointmentCreatedEvent.class));

        mockMvc.perform(post("/api/appointments")
                        .header(RequestContextHolder.HEADER_TENANT_ID, "0")
                        .contentType("application/json")
                        .content("""
                                {
                                                                    "patientName": "张三",
                                                                    "patientIdCard": "320101199001011234",
                                                                    "scheduleCode": "SCH-001"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(500300))
                .andExpect(jsonPath("$.msg").value("预约创建成功，但事件投递失败"));
    }

    @TestConfiguration
    static class MockInfrastructureConfiguration {

        @Bean
        RedissonClient redissonClient() {
            return mock(RedissonClient.class);
        }

        @Bean
        RabbitTemplate rabbitTemplate() {
            return mock(RabbitTemplate.class);
        }

        @Bean("redisTemplate")
        RedisTemplate<Object, Object> redisTemplate() {
            return mock(RedisTemplate.class);
        }
    }
}