package com.df.example.patient.repository;

import com.df.example.patient.model.Patient;
import com.df.jpa.limit.MaxRowLimit;
import com.df.jpa.repository.BaseRepository;
import java.util.List;

public interface PatientRepository extends BaseRepository<Patient, String> {

    @MaxRowLimit(100)
    List<Patient> findByNameContaining(String keyword);
}