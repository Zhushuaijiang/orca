package com.df.example.integration.appointment.event;

import java.io.Serializable;

public class AppointmentCreatedEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    private String appointmentNo;
    private String tenantId;
    private String patientName;
    private String patientIdCard;
    private String scheduleCode;
    private String occurredAt;

    public AppointmentCreatedEvent() {
    }

    public AppointmentCreatedEvent(String appointmentNo,
                                   String tenantId,
                                   String patientName,
                                   String patientIdCard,
                                   String scheduleCode,
                                   String occurredAt) {
        this.appointmentNo = appointmentNo;
        this.tenantId = tenantId;
        this.patientName = patientName;
        this.patientIdCard = patientIdCard;
        this.scheduleCode = scheduleCode;
        this.occurredAt = occurredAt;
    }

    public String getAppointmentNo() {
        return appointmentNo;
    }

    public void setAppointmentNo(String appointmentNo) {
        this.appointmentNo = appointmentNo;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

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

    public String getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(String occurredAt) {
        this.occurredAt = occurredAt;
    }
}