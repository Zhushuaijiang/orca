package com.df.example.patient.controller;

import com.df.example.patient.dto.CreatePatientRequest;
import com.df.example.patient.dto.PatientDetailResponse;
import com.df.example.patient.service.PatientService;
import com.df.utility.pagination.PageData;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/base/patients")
@Tag(name = "患者管理", description = "示例工程中的患者新增、查询与快速检索接口")
public class PatientController {

    private final PatientService patientService;

    public PatientController(PatientService patientService) {
        this.patientService = patientService;
    }

    @PostMapping
        @Operation(
            summary = "新增患者",
            description = "新增当前租户下的患者信息，请求头必须携带 TenantId。"
        )
        @ApiResponses({
            @ApiResponse(responseCode = "200", description = "新增成功"),
            @ApiResponse(responseCode = "400", description = "请求参数不合法", content = @Content(schema = @Schema(hidden = true))),
            @ApiResponse(responseCode = "403", description = "租户无权访问", content = @Content(schema = @Schema(hidden = true)))
        })
    public PatientDetailResponse create(@Valid @RequestBody CreatePatientRequest request) {
        return patientService.create(request);
    }

    @GetMapping("/{id}")
        @Operation(
            summary = "按 ID 查询患者",
            description = "按患者主键查询当前租户下的患者详情，请求头必须携带 TenantId。"
        )
        @ApiResponses({
            @ApiResponse(responseCode = "200", description = "查询成功"),
            @ApiResponse(responseCode = "404", description = "患者不存在", content = @Content(schema = @Schema(hidden = true))),
            @ApiResponse(responseCode = "403", description = "当前租户无权访问该患者", content = @Content(schema = @Schema(hidden = true)))
        })
    public PatientDetailResponse getById(@PathVariable String id) {
        return patientService.getById(id);
    }

    @GetMapping
        @Operation(
            summary = "分页查询患者",
            description = "按关键字分页查询当前租户下的患者列表，请求头必须携带 TenantId。"
        )
        @ApiResponses({
            @ApiResponse(responseCode = "200", description = "查询成功"),
            @ApiResponse(responseCode = "400", description = "分页参数不合法", content = @Content(schema = @Schema(hidden = true))),
            @ApiResponse(responseCode = "403", description = "租户信息缺失或无权访问", content = @Content(schema = @Schema(hidden = true)))
        })
    public PageData<PatientDetailResponse> queryPage(
            @Parameter(description = "患者姓名关键字，支持模糊匹配")
            @RequestParam(required = false) String keyword,
            @Parameter(description = "页码，从 0 开始", example = "0")
            @RequestParam(defaultValue = "0") int pageNumber,
            @Parameter(description = "每页条数", example = "10")
            @RequestParam(defaultValue = "10") int pageSize) {
        return patientService.queryPage(keyword, pageNumber, pageSize);
    }

    @GetMapping("/quick-search")
        @Operation(
            summary = "快速搜索患者",
            description = "返回当前租户下按关键字匹配的前 20 条患者记录，请求头必须携带 TenantId。"
        )
        @ApiResponses({
            @ApiResponse(responseCode = "200", description = "查询成功"),
            @ApiResponse(responseCode = "403", description = "租户信息缺失或无权访问", content = @Content(schema = @Schema(hidden = true)))
        })
    public List<PatientDetailResponse> quickSearch(@RequestParam(required = false) String keyword) {
        return patientService.quickSearch(keyword);
    }
}