-- <DFHIS-XXXXX> <一句话说明>（PostgreSQL）
-- 库/表：<schema.表>  租户：tenantid='0'（主数据）
-- 执行方式：整文件执行；全部语句幂等，可重复执行

-- 1. 表结构变更
alter table <schema>.<table>
    add column if not exists <column> <type> null;

comment on column <schema>.<table>.<column> is '<列含义>';

-- 2. 参数种子
insert into df_zhushuju.gy_canshu
    (zhujianid, yingyongid, canshuid, canshums, canshuzhi, canshuzhipz, queshengzhi,
     xitongbz, chuangjianren, chuangjiansj, xiugairen, xiugaisj)
select '<参数主键>', '<应用号>', '<参数编码>',
       '<参数说明>', '<默认值>', '<取值说明>', '<缺省值>',
       0, 'DBA', current_timestamp, 'DBA', current_timestamp
where not exists (
    select 1 from df_zhushuju.gy_canshu
    where yingyongid = '<应用号>' and canshuid = '<参数编码>'
);

update df_zhushuju.gy_canshu
set canshums = '<参数说明>',
    canshuzhipz = '<取值说明>',
    queshengzhi = '<缺省值>',
    xiugaisj = current_timestamp
where yingyongid = '<应用号>' and canshuid = '<参数编码>';

-- 3. 字典种子
insert into df_zhushuju.gy_daima
    (dmid, daimaid, daimalb, daimamc, mojibz, zuofeibz, shunxuhao,
     menzhensy, jizhensy, zhuyuansy, xitongbz,
     chuangjianren, chuangjiansj, xiugairen, xiugaisj, daimajc, tijiansy, tenantid)
select '<dmid>', '<daimaid>', '<类别>', '<名称>', 1, 0, <序号>,
       1, 1, 1, 1,
       'DBA', current_timestamp, 'DBA', current_timestamp, '<名称>', 1, '0'
where not exists (
    select 1 from df_zhushuju.gy_daima
    where daimalb = '<类别>' and daimaid = '<daimaid>' and tenantid = '0'
);

-- 4. 业务数据维护（如需要；执行前替换为真实 ID）
-- update <schema>.<table>
--    set <column> = '<值>'
--  where <主键> = '<真实ID>';

-- 5. 执行后只读校验
-- select column_name, data_type from information_schema.columns
--  where table_name = '<table>' and column_name = '<column>';
