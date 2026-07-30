package com.df.example.patient.model;

import static com.querydsl.core.types.PathMetadataFactory.forVariable;

import com.querydsl.core.types.Path;
import com.querydsl.core.types.PathMetadata;
import com.querydsl.core.types.dsl.DateTimePath;
import com.querydsl.core.types.dsl.EntityPathBase;
import com.querydsl.core.types.dsl.NumberPath;
import com.querydsl.core.types.dsl.StringPath;
import java.time.Instant;

public class QPatient extends EntityPathBase<Patient> {

    private static final long serialVersionUID = 1L;

    public static final QPatient patient = new QPatient("patient");

    public final StringPath id = createString("id");
    public final StringPath name = createString("name");
    public final NumberPath<Integer> age = createNumber("age", Integer.class);
    public final DateTimePath<Instant> chuangJianSj = createDateTime("chuangJianSj", Instant.class);
    public final DateTimePath<Instant> xiuGaiSj = createDateTime("xiuGaiSj", Instant.class);

    public QPatient(String variable) {
        super(Patient.class, forVariable(variable));
    }

    public QPatient(Path<? extends Patient> path) {
        super(path.getType(), path.getMetadata());
    }

    public QPatient(PathMetadata metadata) {
        super(Patient.class, metadata);
    }
}