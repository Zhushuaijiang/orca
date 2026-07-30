package com.df.example.integration.appointment.dto;

import jakarta.validation.constraints.NotBlank;

public class CreateAppointmentRequest {

    @NotBlank(message = "patientName 不能为空")
    private String patientName;

    @NotBlank(message = "patientIdCard 不能为空")
    private String patientIdCard;

    @NotBlank(message = "scheduleCode 不能为空")
    private String scheduleCode;

    public String getPatientName() {
        return patientName;
    }

    public void setPatientName(String patientName) {
        this.patientName = patientName;
    }

    public String getPatientIdCard() {
        return patientIdCard;
    }

    public void setPatientIdCard(String patientIdCard) {
        this.patientIdCard = patientIdCard;
    }

    public String getScheduleCode() {
        return scheduleCode;
    }

    public void setScheduleCode(String scheduleCode) {
        this.scheduleCode = scheduleCode;
    }
}