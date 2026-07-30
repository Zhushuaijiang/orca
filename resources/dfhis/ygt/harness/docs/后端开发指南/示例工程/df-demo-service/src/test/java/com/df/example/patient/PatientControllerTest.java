package com.df.example.patient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.df.example.patient.model.Patient;
import com.df.example.patient.repository.PatientRepository;
import com.df.utility.context.RequestContextHolder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
class PatientControllerTest {

    private MockMvc mockMvc;

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private PatientRepository patientRepository;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
        patientRepository.deleteAll();
    }

    @Test
    void shouldWrapPlainStringResponse() throws Exception {
        mockMvc.perform(post("/api/base/patients")
                        .header(RequestContextHolder.HEADER_TENANT_ID, "0")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "张三",
                                  "age": 31
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.name").value("张三"))
                .andExpect(jsonPath("$.requestId").isNotEmpty());

        assertThat(patientRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldAllowDefaultTenantWhenHeaderMissing() throws Exception {
        mockMvc.perform(get("/api/base/patients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void shouldQueryPageWithinCurrentTenant() throws Exception {
        Patient patient = new Patient();
        patient.setName("张三");
        patient.setAge(31);
        patientRepository.save(patient);

        mockMvc.perform(get("/api/base/patients")
                        .header(RequestContextHolder.HEADER_TENANT_ID, "0")
                        .param("keyword", "张")
                        .param("pageNumber", "0")
                        .param("pageSize", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value("张三"));
    }
}