package com.df.example.patient.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Schema(name = "CreatePatientRequest", description = "新增患者请求体")
public class CreatePatientRequest {

        @Schema(description = "患者姓名", example = "张三")
        @NotBlank(message = "患者姓名不能为空")
        private String name;

        @Schema(description = "患者年龄", example = "31", minimum = "0")
        @NotNull(message = "年龄不能为空")
        @Min(value = 0, message = "年龄不能小于 0")
        private Integer age;

        public String getName() {
                return name;
        }

        public void setName(String name) {
                this.name = name;
        }

        public Integer getAge() {
                return age;
        }

        public void setAge(Integer age) {
                this.age = age;
        }
}