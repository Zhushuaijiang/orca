package com.df.example.patient.dto;

import com.df.example.patient.model.Patient;
import io.swagger.v3.oas.annotations.media.Schema;

@Schema(name = "PatientDetailResponse", description = "患者详情响应体")
public class PatientDetailResponse {

    @Schema(description = "患者主键", example = "191000000000000001")
    private final String id;

    @Schema(description = "患者姓名", example = "张三")
    private final String name;

    @Schema(description = "患者年龄", example = "31")
    private final Integer age;

    public PatientDetailResponse(String id, String name, Integer age) {
        this.id = id;
        this.name = name;
        this.age = age;
    }

    public static PatientDetailResponse from(Patient patient) {
        return new PatientDetailResponse(
                patient.getId(),
                patient.getName(),
                patient.getAge());
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Integer getAge() {
        return age;
    }
}