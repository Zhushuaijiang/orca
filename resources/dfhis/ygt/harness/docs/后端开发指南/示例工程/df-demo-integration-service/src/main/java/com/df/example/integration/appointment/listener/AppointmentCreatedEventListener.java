package com.df.example.integration.appointment.listener;

import com.df.example.integration.appointment.event.AppointmentCreatedEvent;
import com.df.message.annotation.DfMessageRouteKeyListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AppointmentCreatedEventListener {

    private static final Logger log = LoggerFactory.getLogger(AppointmentCreatedEventListener.class);

    @DfMessageRouteKeyListener(
            exchange = "${demo.messaging.exchange:df.demo.exchange}",
            routeKeys = "${demo.messaging.routing-key:appointment.created}",
            queue = "${spring.application.name:application}.appointment.created",
            lazy = true,
            maxInMemoryLength = 1000,
            maxInMemoryBytes = 1048576)
    public void onAppointmentCreated(AppointmentCreatedEvent event) {
        log.info("received appointment.created event, appointmentNo={}, tenantId={}, scheduleCode={}",
                event.getAppointmentNo(), event.getTenantId(), event.getScheduleCode());
    }
}