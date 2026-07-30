package com.df.example.integration.appointment.controller;

import com.df.example.integration.appointment.dto.AppointmentCreatedResponse;
import com.df.example.integration.appointment.dto.CreateAppointmentRequest;
import com.df.example.integration.appointment.service.AppointmentCommandService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/appointments")
public class AppointmentController {

    private final AppointmentCommandService appointmentCommandService;

    public AppointmentController(AppointmentCommandService appointmentCommandService) {
        this.appointmentCommandService = appointmentCommandService;
    }

    @PostMapping
    public AppointmentCreatedResponse createAppointment(@Valid @RequestBody CreateAppointmentRequest request) {
        return appointmentCommandService.createAppointment(request);
    }

    @GetMapping("/{appointmentNo}/cache")
    public AppointmentCreatedResponse getAppointmentCache(@PathVariable String appointmentNo) {
        return appointmentCommandService.getAppointmentCache(appointmentNo);
    }
}