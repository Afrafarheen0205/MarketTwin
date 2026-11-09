import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Row,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import demandApi, {
  DemandAnalysisResponse,
  DemandMatchClassification,
  DemandUpdatePayload,
} from '../../api/demandApi';

const { Title, Text, Paragraph } = Typography;

const classifications: Array<{ label: string; value: DemandMatchClassification }> = [
  { label: 'All', value: 'all' },
  { label: 'Exact', value: 'exact' },
  { label: 'Similar', value: 'similar' },
  { label: 'Incompatible', value: 'incompatible' },
];

type RequirementEditForm = {
  product_name: string;
  category: string;
  quantity: string;
  unit: string;
  minimum_target_unit_price: string;
  maximum_target_unit_price: string;
  currency: string;
  mandatory_requirements: string;
  optional_preferences: string;
};

function parseRequirementLines(value: string): Record<string, string> {
  const entries = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  const seenNames = new Set<string>();
  entries.forEach((entry) => {
    const separator = entry.indexOf(':');
    if (separator <= 0 || !entry.slice(separator + 1).trim()) {
      throw new Error('Enter each specification as name: value, one per line.');
    }
    const name = entry.slice(0, separator).trim();
    const specification = entry.slice(separator + 1).trim();
    if (seenNames.has(name.toLowerCase())) {
      throw new Error(`The specification "${name}" is listed more than once.`);
    }
    seenNames.add(name.toLowerCase());
    result[name] = specification;
  });
  return result;
}

const DemandAnalysis: React.FC = () => {
  const { demandId = '' } = useParams();
  const navigate = useNavigate();
  const [classification, setClassification] =
    useState<DemandMatchClassification>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DemandAnalysisResponse | null>(null);
  const [reviewingResultId, setReviewingResultId] = useState<string | null>(null);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [reviewingEdits, setReviewingEdits] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RequirementEditForm | null>(null);
  const [pendingEdit, setPendingEdit] = useState<DemandUpdatePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysisRequest = useRef<{
    key: string;
    promise: Promise<DemandAnalysisResponse>;
  } | null>(null);

  const loadAnalysis = useCallback(async () => {
    if (!demandId) {
      setError('Demand reference is missing.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const requestKey = JSON.stringify([demandId, page, 10, classification]);
      let request =
        analysisRequest.current?.key === requestKey
          ? analysisRequest.current.promise
          : null;
      if (!request) {
        request = demandApi.analyzeDemand(demandId, {
          page,
          page_size: 10,
          classification,
        });
        const requestEntry = { key: requestKey, promise: request };
        analysisRequest.current = requestEntry;
        void request.then(
          () => {
            if (analysisRequest.current === requestEntry) analysisRequest.current = null;
          },
          () => {
            if (analysisRequest.current === requestEntry) analysisRequest.current = null;
          }
        );
      }
      const response = await request;
      setData(response);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to analyze existing demands.'
      );
    } finally {
      setLoading(false);
    }
  }, [classification, demandId, page]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  const summary = data?.summary;
  const resultRows = data?.results ?? [];
  const canEditCurrentDemand = ['submitted', 'under review'].includes(
    (data?.current_demand.status || '').toLowerCase()
  );

  const openRequirementEditor = () => {
    const current = data?.current_demand;
    if (!current) return;
    const specifications = current.technical_specifications ?? [];
    setEditForm({
      product_name: current.product_name || '',
      category: current.category || '',
      quantity: current.quantity == null ? '' : String(current.quantity),
      unit: current.unit || '',
      minimum_target_unit_price:
        current.minimum_target_unit_price == null
          ? ''
          : String(current.minimum_target_unit_price),
      maximum_target_unit_price:
        current.maximum_target_unit_price == null
          ? ''
          : String(current.maximum_target_unit_price),
      currency: current.currency || '',
      mandatory_requirements: specifications
        .filter((item) => item.mandatory)
        .map((item) => `${item.name}: ${item.value}`)
        .join('\n'),
      optional_preferences: specifications
        .filter((item) => !item.mandatory)
        .map((item) => `${item.name}: ${item.value}`)
        .join('\n'),
    });
    setPendingEdit(null);
    setEditError(null);
    setReviewingEdits(false);
    setEditingRequirements(true);
  };

  const reviewRequirementEdits = () => {
    if (!editForm) return;
    try {
      const mandatory = parseRequirementLines(editForm.mandatory_requirements);
      const optional = parseRequirementLines(editForm.optional_preferences);
      const quantity = Number(editForm.quantity);
      const minimum = Number(editForm.minimum_target_unit_price);
      const maximum = Number(editForm.maximum_target_unit_price);
      if (
        !editForm.product_name.trim() ||
        !editForm.category.trim() ||
        !editForm.unit.trim() ||
        !editForm.currency.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(minimum) ||
        minimum <= 0 ||
        !Number.isFinite(maximum) ||
        maximum < minimum
      ) {
        throw new Error('Complete the product, quantity, unit, currency, and valid price range.');
      }
      const mandatoryKeys = new Set(
        Object.keys(mandatory).map((name) => name.toLowerCase())
      );
      if (Object.keys(optional).some((name) => mandatoryKeys.has(name.toLowerCase()))) {
        throw new Error('A specification cannot be both mandatory and an optional preference.');
      }
      const technicalSpecifications = [
        ...Object.entries(mandatory).map(([name, value]) => ({
          name,
          value,
          mandatory: true,
        })),
        ...Object.entries(optional).map(([name, value]) => ({
          name,
          value,
          mandatory: false,
        })),
      ];
      setPendingEdit({
        product_name: editForm.product_name.trim(),
        category: editForm.category.trim(),
        quantity,
        unit: editForm.unit.trim(),
        minimum_target_unit_price: minimum,
        maximum_target_unit_price: maximum,
        currency: editForm.currency.trim().toUpperCase(),
        mandatory_requirements: mandatory,
        optional_preferences: optional,
        technical_specifications: technicalSpecifications,
      });
      setEditError(null);
      setReviewingEdits(true);
    } catch (validationError) {
      setEditError(
        validationError instanceof Error
          ? validationError.message
          : 'Review the revised requirements and try again.'
      );
    }
  };

  const saveReviewedRequirements = async () => {
    if (!pendingEdit) return;
    setSavingEdits(true);
    setEditError(null);
    try {
      await demandApi.updateDemand(demandId, pendingEdit);
      setEditingRequirements(false);
      setReviewingEdits(false);
      setPendingEdit(null);
      await loadAnalysis();
    } catch (saveError) {
      setEditError(
        saveError instanceof Error
          ? saveError.message
          : 'The revised requirements could not be saved. Your original demand is unchanged.'
      );
    } finally {
      setSavingEdits(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <Space direction="vertical" size={8}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/customer/demands')}
          >
            View My Demands
          </Button>
          <Title level={3} style={{ margin: 0 }}>Existing Demand Analysis</Title>
          {data?.current_demand && (
            <Text type="secondary">
              Comparing persisted demands for {data.current_demand.product_name}
              {data.current_demand.demand_code
                ? ` · ${data.current_demand.demand_code}`
                : ''}
            </Text>
          )}
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          title="Demand analysis could not be loaded."
          description={error}
          action={
            <Button icon={<ReloadOutlined />} onClick={() => void loadAnalysis()}>
              Retry
            </Button>
          }
        />
      )}
      <Modal
        title={reviewingEdits ? 'Review revised requirements' : 'Edit my requirements'}
        open={editingRequirements}
        onCancel={() => {
          setEditingRequirements(false);
          setReviewingEdits(false);
          setPendingEdit(null);
          setEditError(null);
        }}
        confirmLoading={savingEdits}
        width={720}
        footer={
          reviewingEdits
            ? [
                <Button
                  key="back"
                  disabled={savingEdits}
                  onClick={() => setReviewingEdits(false)}
                >
                  Back to edit
                </Button>,
                <Button
                  key="save"
                  type="primary"
                  loading={savingEdits}
                  onClick={() => void saveReviewedRequirements()}
                >
                  Confirm and save changes
                </Button>,
              ]
            : [
                <Button
                  key="cancel"
                  onClick={() => setEditingRequirements(false)}
                >
                  Cancel
                </Button>,
                <Button
                  key="review"
                  type="primary"
                  onClick={reviewRequirementEdits}
                >
                  Review revised requirements
                </Button>,
              ]
        }
      >
        {editError && (
          <Alert
            style={{ marginBottom: 16 }}
            type="error"
            showIcon
            title={editError}
          />
        )}
        {reviewingEdits && pendingEdit ? (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Product">
              {pendingEdit.product_name}
            </Descriptions.Item>
            <Descriptions.Item label="Category">
              {pendingEdit.category}
            </Descriptions.Item>
            <Descriptions.Item label="Quantity">
              {pendingEdit.quantity} {pendingEdit.unit}
            </Descriptions.Item>
            <Descriptions.Item label="Target unit price">
              {pendingEdit.minimum_target_unit_price} – {pendingEdit.maximum_target_unit_price}{' '}
              {pendingEdit.currency}
            </Descriptions.Item>
            <Descriptions.Item label="Mandatory specifications">
              {Object.entries(pendingEdit.mandatory_requirements || {})
                .map(([name, value]) => `${name}: ${value}`)
                .join('; ') || 'None'}
            </Descriptions.Item>
            <Descriptions.Item label="Optional preferences">
              {Object.entries(pendingEdit.optional_preferences || {})
                .map(([name, value]) => `${name}: ${value}`)
                .join('; ') || 'None'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form layout="vertical">
            <Form.Item label="Product name">
              <Input
                value={editForm?.product_name}
                onChange={(event) =>
                  setEditForm((current) => current && {
                    ...current,
                    product_name: event.target.value,
                  })
                }
              />
            </Form.Item>
            <Form.Item label="Category">
              <Input
                value={editForm?.category}
                onChange={(event) =>
                  setEditForm((current) => current && {
                    ...current,
                    category: event.target.value,
                  })
                }
              />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item label="Quantity">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={editForm?.quantity}
                    onChange={(event) =>
                      setEditForm((current) => current && {
                        ...current,
                        quantity: event.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Unit">
                  <Input
                    value={editForm?.unit}
                    onChange={(event) =>
                      setEditForm((current) => current && {
                        ...current,
                        unit: event.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} sm={8}>
                <Form.Item label="Minimum target unit price">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={editForm?.minimum_target_unit_price}
                    onChange={(event) =>
                      setEditForm((current) => current && {
                        ...current,
                        minimum_target_unit_price: event.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Maximum target unit price">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={editForm?.maximum_target_unit_price}
                    onChange={(event) =>
                      setEditForm((current) => current && {
                        ...current,
                        maximum_target_unit_price: event.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Currency">
                  <Input
                    maxLength={3}
                    value={editForm?.currency}
                    onChange={(event) =>
                      setEditForm((current) => current && {
                        ...current,
                        currency: event.target.value,
                      })
                    }
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Mandatory specifications (one name: value per line)">
              <Input.TextArea
                rows={4}
                value={editForm?.mandatory_requirements}
                onChange={(event) =>
                  setEditForm((current) => current && {
                    ...current,
                    mandatory_requirements: event.target.value,
                  })
                }
              />
            </Form.Item>
            <Form.Item label="Optional preferences (one name: value per line)">
              <Input.TextArea
                rows={4}
                value={editForm?.optional_preferences}
                onChange={(event) =>
                  setEditForm((current) => current && {
                    ...current,
                    optional_preferences: event.target.value,
                  })
                }
              />
            </Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        title="Review similar demand"
        open={Boolean(reviewingResultId)}
        onCancel={() => setReviewingResultId(null)}
        footer={[
          <Button key="close" onClick={() => setReviewingResultId(null)}>
            Close
          </Button>,
        ]}
      >
        {resultRows
          .filter((result) => result.demand.id === reviewingResultId)
          .map((result) => (
            <div key={result.demand.id}>
              <Title level={5}>{result.demand.product_name || 'Product not provided'}</Title>
              <Paragraph>{result.explanation}</Paragraph>
              {result.differences.map((difference) => (
                <Paragraph key={difference} type="secondary">{difference}</Paragraph>
              ))}
              <Text>
                No requirements are copied or changed by reviewing another demand.
              </Text>
            </div>
          ))}
      </Modal>

      {summary && (
        <Row gutter={[16, 16]}>
          {[
            ['My Existing Demands', summary.my_existing_demands_count],
            ['Exact Matching Demands', summary.exact_match_count],
            ['Similar Demands', summary.similar_match_count],
            ['Related but Incompatible', summary.incompatible_match_count],
            ['Other Customers with Exact Matches', summary.distinct_exact_customers_count],
            ['Other Customers with Similar Matches', summary.distinct_similar_customers_count],
            ['Distinct Compatible Customers', summary.distinct_compatible_customers_count],
          ].map(([label, count]) => (
            <Col xs={24} sm={12} lg={8} key={String(label)}>
              <Card size="small">
                <Text type="secondary">{label}</Text>
                <Title level={3} style={{ margin: '8px 0 0' }}>{count}</Title>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {summary && (
        <Card title="Anonymized compatible-demand summary">
          <Space direction="vertical">
            <Text>{summary.compatible_demand_count} compatible demand records from {summary.distinct_compatible_customers_count} distinct customers.</Text>
            <Text>
              Aggregate quantity: {summary.total_requested_quantity ?? 'Not safely aggregateable'}
              {summary.total_requested_quantity_unit ? ` ${summary.total_requested_quantity_unit}` : ''}
            </Text>
            <Text>
              Compatible target-price range: {summary.aggregate_minimum_target_unit_price ?? 'Not safely aggregateable'}
              {' – '}
              {summary.aggregate_maximum_target_unit_price ?? 'Not safely aggregateable'}
              {summary.aggregate_currency ? ` ${summary.aggregate_currency}` : ''}
            </Text>
            <Text>
              Merchant opportunity threshold (&gt;50 distinct customers):{' '}
              {summary.merchant_opportunity_eligible ? 'Reached' : 'Not reached'}
            </Text>
            {summary.common_mandatory_requirements.length > 0 && (
              <Text>
                Common mandatory requirements: {summary.common_mandatory_requirements
                  .map((item) => `${item.name}: ${item.value}`)
                  .join('; ')}
              </Text>
            )}
          </Space>
        </Card>
      )}

      <Card
        title="Persisted demand comparisons"
        extra={
          <Segmented
            value={classification}
            options={classifications}
            onChange={(value) => {
              setPage(1);
              setClassification(value as DemandMatchClassification);
            }}
          />
        }
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
        ) : resultRows.length === 0 && !error ? (
          <Empty description="No matching persisted demands were found." />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {resultRows.map((result) => (
              <Card
                key={result.demand.id}
                size="small"
                title={
                  <Space wrap>
                    <span>{result.demand.product_name || 'Product not provided'}</span>
                    <Tag color={
                      result.classification === 'exact'
                        ? 'green'
                        : result.classification === 'similar'
                          ? 'blue'
                          : 'red'
                    }>
                      {result.classification.toUpperCase()}
                    </Tag>
                  </Space>
                }
              >
                <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                  <Descriptions.Item label="Demand reference">
                    {result.demand.demand_code || 'Not provided'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Category">
                    {result.demand.category || 'Not specified'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <Badge status="processing" text={result.demand.status || 'Not provided'} />
                  </Descriptions.Item>
                  <Descriptions.Item label="Quantity">
                    {result.demand.quantity ?? 'Not specified'} {result.demand.unit || ''}
                  </Descriptions.Item>
                  <Descriptions.Item label="Target unit price range">
                    {result.demand.minimum_target_unit_price ?? 'Not specified'}
                    {' – '}
                    {result.demand.maximum_target_unit_price ?? 'Not specified'}
                    {result.demand.currency ? ` ${result.demand.currency}` : ''}
                  </Descriptions.Item>
                  <Descriptions.Item label="Created">
                    {result.demand.created_at
                      ? new Date(result.demand.created_at).toLocaleString()
                      : 'Not provided'}
                  </Descriptions.Item>
                </Descriptions>
                <Paragraph>{result.explanation}</Paragraph>
                <Title level={5}>Specification comparison</Title>
                {result.comparisons.map((comparison) => (
                  <div
                    key={`${result.demand.id}-${comparison.key}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(120px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) auto',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <Text strong>{comparison.key}</Text>
                    <Text>{comparison.current_value || 'Not specified'}</Text>
                    <Text>{comparison.other_value || 'Not specified'}</Text>
                    <Tag color={
                      comparison.state === 'PASS'
                        ? 'green'
                        : comparison.state === 'FAIL'
                          ? 'red'
                          : 'default'
                    }>
                      {comparison.state === 'PASS'
                        ? 'Match'
                        : comparison.state === 'FAIL'
                          ? 'Incompatible'
                          : 'Not specified'}
                    </Tag>
                  </div>
                ))}
                {result.differences.length > 0 && (
                  <Alert
                    style={{ marginTop: 12 }}
                    type={result.classification === 'incompatible' ? 'warning' : 'info'}
                    title="Differences"
                    description={result.differences.join(' ')}
                  />
                )}
                {result.classification === 'similar' && (
                  <Button
                    style={{ marginTop: 12 }}
                    onClick={() => setReviewingResultId(result.demand.id)}
                  >
                    Review Similar Demand
                  </Button>
                )}
              </Card>
            ))}
            {data?.pagination && data.pagination.total > data.pagination.page_size && (
              <Pagination
                current={data.pagination.page}
                pageSize={data.pagination.page_size}
                total={data.pagination.total}
                onChange={setPage}
                showTotal={(total) => `${total} persisted demand(s)`}
              />
            )}
          </Space>
        )}
      </Card>

      <Card>
        <Space wrap>
          <Button type="primary" onClick={() => navigate('/customer/demands')}>
            Keep My Original Requirements
          </Button>
          <Button
            disabled={!canEditCurrentDemand || !data?.current_demand}
            onClick={openRequirementEditor}
          >
            Edit My Requirements
          </Button>
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Reviewing similar demands never copies or changes their requirements. Only your own editable demand can be changed after reviewing and explicitly confirming the revised summary.
        </Paragraph>
      </Card>
    </div>
  );
};

export default DemandAnalysis;
