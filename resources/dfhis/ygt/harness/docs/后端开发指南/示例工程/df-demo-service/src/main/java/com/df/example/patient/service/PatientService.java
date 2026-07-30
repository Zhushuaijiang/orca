package com.df.example.patient.service;

import com.df.example.patient.dto.CreatePatientRequest;
import com.df.example.patient.dto.PatientDetailResponse;
import com.df.example.patient.model.Patient;
import com.df.example.patient.repository.PatientRepository;
import com.df.jpa.specification.SpecificationBuilder;
import com.df.utility.error.CommonErrorCode;
import com.df.utility.exception.BusinessException;
import com.df.utility.pagination.PageData;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class PatientService {

    private final PatientRepository patientRepository;

    public PatientService(PatientRepository patientRepository) {
        this.patientRepository = patientRepository;
    }

    public PatientDetailResponse create(CreatePatientRequest request) {
        Patient patient = new Patient();
        patient.setName(request.getName());
        patient.setAge(request.getAge());
        Patient saved = patientRepository.save(patient);
        return PatientDetailResponse.from(saved);
    }

    public PatientDetailResponse getById(String id) {
        Patient patient = patientRepository.findById(id)
                .orElseThrow(() -> new BusinessException(CommonErrorCode.NOT_FOUND, "患者不存在"));
        return PatientDetailResponse.from(patient);
    }

    public PageData<PatientDetailResponse> queryPage(String keyword, int pageNumber, int pageSize) {
        Pageable pageable = PageRequest.of(pageNumber, pageSize, Sort.by(Sort.Direction.DESC, "chuangJianSj"));
        return patientRepository.queryPageData(
                SpecificationBuilder.<Patient>builder()
                        .like("name", keyword)
                        .build(),
                pageable,
                PatientDetailResponse::from);
    }

    public List<PatientDetailResponse> quickSearch(String keyword) {
        return patientRepository.queryProjectionSafeList(
                SpecificationBuilder.<Patient>builder()
                        .like("name", keyword)
                        .build(),
            Sort.by(Sort.Direction.DESC, "chuangJianSj"),
                20,
                PatientDetailResponse::from);
    }
}