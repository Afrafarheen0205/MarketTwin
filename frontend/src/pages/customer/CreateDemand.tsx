import React, { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Steps,
  Typography,
} from 'antd';
import {
  AppstoreAddOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../context/AuthContext';
import demandApi, { DemandSpecification } from '../../api/demandApi';
import {
  clearReviewedDemandDraft,
  loadReviewedDemandDraft,
  type ReviewedDemandDraft,
} from '../../utils/reviewedDemandDraft';
import { createSecureUuid } from '../../utils/secureUuid';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const SUBMISSION_ID_KEY = 'markettwin_demand_submission_id_v1';

interface EditableSpecification {
  name: string;
  value: string;
}

const toDemandSpecifications = (
  mandatory: EditableSpecification[] = [],
  optional: EditableSpecification[] = []
): DemandSpecification[] => [
  ...mandatory.map(({ name, value }) => ({
    name: name.trim(),
    value: value.trim(),
    mandatory: true,
  })),
  ...optional.map(({ name, value }) => ({
    name: name.trim(),
    value: value.trim(),
    mandatory: false,
  })),
].filter(({ name, value }) => name && value);

const parseAmount = (value?: string): number | undefined => {
  if (
    !value ||
    /\b(?:under|below|up to|at most|less than|more than|over|above|between|from|to|about|around|approximately|approx)\b|[-–—]/i.test(value)
  ) {
    return undefined;
  }
  const matches = value.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length !== 1) return undefined;
  const parsed = Number(matches[0].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseQuantityUnit = (value?: string): string | undefined => {
  const match = value?.match(/^\s*(?:quantity\s*)?[\d,]+(?:\.\d+)?\s+(.+?)\s*$/i);
  return match?.[1]?.trim() || undefined;
};

const firstValue = (
  values: Record<string, string>,
  keys: string[]
): string | undefined => {
  const entry = Object.entries(values).find(([key]) =>
    keys.includes(key.toLowerCase())
  );
  return entry?.[1];
};

const draftFormValues = (
  reviewed: ReviewedDemandDraft | null,
  manualDefaults: {
    product: string;
    category: string;
    description: string;
  },
  isAIDraftFlow: boolean
) => {
  const draft = reviewed?.draft;
  if (!draft) {
    return {
      title: manualDefaults.product,
      category: isAIDraftFlow ? undefined : manualDefaults.category,
      targetQuantity: undefined,
      waitingPeriodDays: undefined,
      unit: '',
      minimumTargetPrice: undefined,
      maximumTargetPrice: undefined,
      currency: '',
      description: manualDefaults.description,
      additionalRequirements: '',
      mandatorySpecifications: [],
      optionalSpecifications: [],
    };
  }

  const mandatory = draft.mandatory_requirements;
  const commercial = draft.commercial_constraints;
  const location = firstValue(draft.delivery_constraints, [
    'location',
    'destination',
    'delivery_location',
  ]);
  const deliveryDuration = firstValue(draft.delivery_constraints, [
    'duration',
    'delivery_duration',
    'expected_delivery_duration',
    'expected_lead_time',
    'lead_time',
  ]);
  const separateDeliveryKeys = [
    'location',
    'destination',
    'delivery_location',
    'duration',
    'delivery_duration',
    'expected_delivery_duration',
    'expected_lead_time',
    'lead_time',
  ];
  const deliveryRequirements = Object.fromEntries(
    Object.entries(draft.delivery_constraints).filter(
      ([key]) => !separateDeliveryKeys.includes(key.toLowerCase())
    )
  );
  const targetQuantity = parseAmount(commercial.quantity);
  const parsedDeliveryDays = deliveryDuration?.match(
    /^\s*(?:within\s+)?(\d+)\s+days?\s*$/i
  );
  const waitingPeriodDays = parsedDeliveryDays
    ? Number(parsedDeliveryDays[1])
    : undefined;
  const minimumTargetPrice = parseAmount(commercial.minimum_target_unit_price);
  const maximumTargetPrice = parseAmount(commercial.maximum_target_unit_price);
  const knownCommercialKeys = new Set([
    'quantity',
    'unit',
    'minimum_target_unit_price',
    'maximum_target_unit_price',
    'currency',
    'additional_requirements',
  ]);
  const supplementaryDetails = Object.entries(commercial)
    .filter(([key]) => !knownCommercialKeys.has(key.toLowerCase()))
    .map(([key, value]) => `${key}: ${value}`);
  if (
    draft.product_type &&
    draft.product_name &&
    draft.product_type.toLowerCase() !== draft.product_name.toLowerCase()
  ) {
    supplementaryDetails.unshift(`Product type: ${draft.product_type}`);
  }
  if (commercial.quantity && targetQuantity === undefined) {
    supplementaryDetails.push(`Purchase quantity detail: ${commercial.quantity}`);
  }
  if (commercial.minimum_target_unit_price && minimumTargetPrice === undefined) {
    supplementaryDetails.push(`Minimum target unit price detail: ${commercial.minimum_target_unit_price}`);
  }
  if (commercial.maximum_target_unit_price && maximumTargetPrice === undefined) {
    supplementaryDetails.push(`Maximum target unit price detail: ${commercial.maximum_target_unit_price}`);
  }
  if (commercial.budget) {
    supplementaryDetails.push(`Customer-stated budget: ${commercial.budget}`);
  }

  return {
    title: draft.product_name || draft.product_type || '',
    category: draft.category || undefined,
    description: reviewed.originalRequirement,
    brand: firstValue(mandatory, ['brand', 'preferred_brand']),
    model: firstValue(mandatory, ['model', 'model_number']),
    mandatorySpecifications: Object.entries(mandatory)
      .filter(([key]) => !['brand', 'preferred_brand', 'model', 'model_number'].includes(key.toLowerCase()))
      .map(([name, value]) => ({ name, value })),
    optionalSpecifications: Object.entries(draft.optional_preferences).map(
      ([name, value]) => ({ name, value })
    ),
    targetQuantity,
    waitingPeriodDays,
    unit: commercial.unit || parseQuantityUnit(commercial.quantity) || '',
    minimumTargetPrice,
    maximumTargetPrice,
    currency: commercial.currency || '',
    deliveryRequirementsText: Object.entries(deliveryRequirements)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
    deliveryDuration: deliveryDuration || '',
    deliveryLocation: location || '',
    additionalRequirements: [
      commercial.additional_requirements,
      ...supplementaryDetails,
    ]
      .filter(Boolean)
      .join('\n'),
  };
};

export const CreateDemand: React.FC = () => {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [reviewedDraft] = useState(loadReviewedDemandDraft);
  const isAIDraftFlow = searchParams.get('source') === 'ai';
  const initialProduct =
    searchParams.get('product') ||
    searchParams.get('search') ||
    searchParams.get('q') ||
    '';
  const initialCategory =
    searchParams.get('category') || 'Industrial Equipment';
  const initialDesc =
    searchParams.get('desc') ||
    searchParams.get('description') ||
    (initialProduct
      ? `Custom specifications and quality requirements for ${initialProduct}`
      : '');

  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const submissionId = useRef<string | null>(null);

  const initialValues = draftFormValues(reviewedDraft, {
    product: initialProduct,
    category: initialCategory,
    description: initialDesc,
  }, isAIDraftFlow);
  const initialCategoryValue = initialValues.category;
  const formInitialValues = {
    ...initialValues,
    category: initialCategoryValue ? [initialCategoryValue] : undefined,
  };
  const mandatoryRequirements =
    reviewedDraft?.draft.mandatory_requirements ?? {};
  const brandIsMandatory = Boolean(
    firstValue(mandatoryRequirements, ['brand', 'preferred_brand'])
  );
  const modelIsMandatory = Boolean(
    firstValue(mandatoryRequirements, ['model', 'model_number'])
  );
  const deliveryConstraints = reviewedDraft?.draft.delivery_constraints ?? {};
  const hasDeliveryLocation = Boolean(
    firstValue(deliveryConstraints, ['location', 'destination', 'delivery_location'])
  );
  const hasOtherDeliveryConstraints = Object.keys(deliveryConstraints).some(
    (key) =>
      ![
        'location',
        'destination',
        'delivery_location',
        'duration',
        'delivery_duration',
        'expected_delivery_duration',
        'expected_lead_time',
        'lead_time',
      ].includes(key.toLowerCase())
  );
  const hasDeliveryDuration = Boolean(
    firstValue(deliveryConstraints, [
      'duration',
      'delivery_duration',
      'expected_delivery_duration',
      'expected_lead_time',
      'lead_time',
    ])
  );

  const handleNext = async () => {
    try {
      if (currentStep < 2) {
        await form.validateFields();
        setCurrentStep((previous) => previous + 1);
        return;
      }

      await form.validateFields();
      if (isAIDraftFlow && !reviewedDraft) {
        setSubmissionError('The reviewed AI requirement is missing or expired. Review it again before creating a demand.');
        return;
      }
      if (!user || role !== 'customer') {
        navigate('/login?role=customer', {
          state: { from: { pathname: '/customer/demands/create' } },
        });
        return;
      }
      if (submissionLock.current) return;

      const values = form.getFieldsValue(true);
      const selectedCategory = Array.isArray(values.category)
        ? values.category[0]
        : values.category;
      if (
        values.targetQuantity === undefined ||
        values.targetQuantity === null ||
        !values.title?.trim() ||
        !selectedCategory?.trim() ||
        !values.unit?.trim() ||
        !values.currency?.trim() ||
        values.minimumTargetPrice === undefined ||
        values.minimumTargetPrice === null ||
        values.maximumTargetPrice === undefined ||
        values.maximumTargetPrice === null
      ) {
        setSubmissionError(
          'Complete the product, category, quantity, unit, price range, and currency before submitting.'
        );
        setCurrentStep(
          !values.title?.trim() || !selectedCategory?.trim() ? 0 : 1
        );
        return;
      }
      submissionLock.current = true;
      setLoading(true);
      setSubmissionError(null);
      const specifications = toDemandSpecifications(
        values.mandatorySpecifications || [],
        values.optionalSpecifications || []
      );
      const mandatoryRequirements = Object.fromEntries(
        (values.mandatorySpecifications || [])
          .filter((item: EditableSpecification) => item.name?.trim() && item.value?.trim())
          .map((item: EditableSpecification) => [item.name.trim(), item.value.trim()])
      );
      const optionalPreferences = Object.fromEntries(
        (values.optionalSpecifications || [])
          .filter((item: EditableSpecification) => item.name?.trim() && item.value?.trim())
          .map((item: EditableSpecification) => [item.name.trim(), item.value.trim()])
      );
      if (values.brand?.trim()) {
        (brandIsMandatory ? mandatoryRequirements : optionalPreferences).brand = values.brand.trim();
      }
      if (values.model?.trim()) {
        (modelIsMandatory ? mandatoryRequirements : optionalPreferences)['model number'] = values.model.trim();
      }
      try {
        if (!submissionId.current) {
          try {
            submissionId.current = sessionStorage.getItem(SUBMISSION_ID_KEY);
          } catch {
            submissionId.current = null;
          }
          if (!submissionId.current) {
            submissionId.current = createSecureUuid();
            try {
              sessionStorage.setItem(SUBMISSION_ID_KEY, submissionId.current);
            } catch {
              // Keep the key for retries during this page lifetime if storage is unavailable.
            }
          }
        }
        const data = await demandApi.createDemand({
          product_name: values.title.trim(),
          category: selectedCategory.trim(),
          description: values.description,
          brand: values.brand,
          model_number: values.model,
          technical_specifications: specifications,
          quantity: values.targetQuantity,
          unit: values.unit || 'units',
          minimum_target_unit_price: values.minimumTargetPrice,
          maximum_target_unit_price: values.maximumTargetPrice,
          currency: values.currency.trim().toUpperCase(),
          expected_lead_time: values.waitingPeriodDays,
          required_delivery_date: values.deadline
            ? values.deadline.format('YYYY-MM-DD')
            : null,
          delivery_address: {
            address: values.deliveryLocation || '',
            instructions: [
              values.deliveryRequirementsText,
              values.deliveryDuration,
              values.shippingTerms,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          additional_requirements: values.additionalRequirements || '',
          mandatory_requirements: mandatoryRequirements,
          optional_preferences: optionalPreferences,
        }, submissionId.current);
        clearReviewedDemandDraft();
        try {
          sessionStorage.removeItem(SUBMISSION_ID_KEY);
        } catch {
          // The database idempotency key remains safe to reuse if storage cleanup fails.
        }
        submissionId.current = null;
        navigate('/customer/demands', {
          replace: true,
          state: { submittedDemandId: data.id },
        });
      } catch (requestError) {
        const status =
          typeof requestError === 'object' && requestError !== null && 'status' in requestError
            ? Number(requestError.status)
            : undefined;
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Demand submission failed. Please try again.';
        console.error('[Demand submission failed]', { status, message });
        setSubmissionError(
          status === 401 || status === 403
            ? 'Your customer session has expired or is no longer authorized. Sign in again; your form entries are preserved.'
            : message
        );
      } finally {
        submissionLock.current = false;
        setLoading(false);
      }
    } catch {
      // Ant Design displays field-level validation messages.
    }
  };

  const handleCancel = (): void => {
    if (isAIDraftFlow) clearReviewedDemandDraft();
    try {
      sessionStorage.removeItem(SUBMISSION_ID_KEY);
    } catch {
      // Session storage is optional; the demand was not submitted.
    }
    navigate('/');
  };

  const handlePrev = () => setCurrentStep((previous) => previous - 1);

  if (authLoading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading session...</div>;
  }

  if (!user || role !== 'customer') {
    return (
      <Alert
        type="error"
        showIcon
        title="Customer authentication is required to create a demand."
        action={
          <Button
            onClick={() =>
              navigate('/login?role=customer', {
                state: { from: { pathname: '/customer/demands/create', search: window.location.search } },
              })
            }
          >
            Sign in
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: '20px 24px' } }}>
        <Title level={4} style={{ margin: 0 }}>Create Product Demand</Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          Review and edit the demand details before submitting them to suppliers.
        </Paragraph>
      </Card>
      {isAIDraftFlow && !reviewedDraft && (
        <Alert
          type="warning"
          showIcon
          title="The reviewed AI summary is missing, malformed, or expired."
          description="Return to product discovery and review the requirement summary again. No demand has been created."
          action={<Button onClick={handleCancel}>Return to product discovery</Button>}
        />
      )}
      {isAIDraftFlow && reviewedDraft && (
        <Card title="Original shopping request">
          <Paragraph style={{ marginBottom: 0 }}>{reviewedDraft.originalRequirement}</Paragraph>
        </Card>
      )}
      {submissionError && <Alert type="error" showIcon title={submissionError} />}
      <Card style={{ background: '#FFFFFF', borderColor: '#EBECF0' }} styles={{ body: { padding: 28 } }}>
        <Steps
          current={currentStep}
          style={{ marginBottom: 32 }}
          items={[
            { title: 'Product Specification', icon: <AppstoreAddOutlined /> },
            {
              title: isAIDraftFlow ? 'Waiting Period' : 'Volume & Budget',
              icon: <DollarOutlined />,
            },
            { title: 'Review & Submit', icon: <ThunderboltOutlined /> },
          ]}
        />
        <Form form={form} layout="vertical" initialValues={formInitialValues}>
          {currentStep === 0 && (
            <div>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="title" label="Product Name" rules={[{ required: true, whitespace: true, message: 'Please enter a product name' }]}>
                    <Input size="large" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item
                    name="brand"
                    label={brandIsMandatory ? 'Brand (mandatory)' : 'Brand'}
                    rules={
                      brandIsMandatory
                        ? [{ required: true, message: 'A brand is required' }]
                        : undefined
                    }
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item
                    name="model"
                    label={modelIsMandatory ? 'Model (mandatory)' : 'Model'}
                    rules={
                      modelIsMandatory
                        ? [{ required: true, message: 'A model is required' }]
                        : undefined
                    }
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="category"
                    label="Category"
                    rules={[
                      {
                        validator: async (_, value: unknown) => {
                          const category = Array.isArray(value) ? value[0] : value;
                          if (typeof category === 'string' && category.trim()) return;
                          throw new Error('Please select or enter a category');
                        },
                      },
                    ]}
                  >
                    <Select
                      allowClear
                      showSearch
                      mode="tags"
                      maxCount={1}
                      options={[
                        'Office Furniture',
                        'Renewable Energy',
                        'Commercial Kitchen',
                        'Electronics',
                        'Food & Beverage',
                        'Industrial Equipment',
                        ...(initialCategoryValue ? [initialCategoryValue] : []),
                      ].map((category) => ({ label: category, value: category }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Mandatory specifications">
                <Form.List name="mandatorySpecifications">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {fields.map((field) => (
                        <Row key={field.key} gutter={8} align="top">
                          <Col flex="1">
                            <Form.Item
                              name={[field.name, 'name']}
                              rules={[{ required: true, whitespace: true, message: 'Enter a requirement name' }]}
                            >
                              <Input placeholder="Specification" aria-label="Mandatory specification name" />
                            </Form.Item>
                          </Col>
                          <Col flex="2">
                            <Form.Item
                              name={[field.name, 'value']}
                              rules={[{ required: true, whitespace: true, message: 'Enter a requirement value' }]}
                            >
                              <Input placeholder="Required value" aria-label="Mandatory specification value" />
                            </Form.Item>
                          </Col>
                          <Col>
                            <Button
                              aria-label="Remove mandatory specification"
                              icon={<MinusCircleOutlined />}
                              onClick={() => remove(field.name)}
                            />
                          </Col>
                        </Row>
                      ))}
                      <Button type="dashed" onClick={() => add({ name: '', value: '' })} icon={<PlusOutlined />}>
                        Add mandatory specification
                      </Button>
                    </Space>
                  )}
                </Form.List>
              </Form.Item>
              <Form.Item label="Optional specifications and preferences">
                <Form.List name="optionalSpecifications">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {fields.map((field) => (
                        <Row key={field.key} gutter={8} align="top">
                          <Col flex="1">
                            <Form.Item
                              name={[field.name, 'name']}
                              rules={[
                                ({ getFieldValue }) => ({
                                  validator(_, value: string | undefined) {
                                    const sibling = getFieldValue([
                                      'optionalSpecifications',
                                      field.name,
                                      'value',
                                    ]);
                                    if (!value?.trim() && !sibling?.trim()) return Promise.resolve();
                                    if (value?.trim()) return Promise.resolve();
                                    return Promise.reject(new Error('Enter a preference name'));
                                  },
                                }),
                              ]}
                            >
                              <Input placeholder="Preference" aria-label="Optional specification name" />
                            </Form.Item>
                          </Col>
                          <Col flex="2">
                            <Form.Item
                              name={[field.name, 'value']}
                              rules={[
                                ({ getFieldValue }) => ({
                                  validator(_, value: string | undefined) {
                                    const sibling = getFieldValue([
                                      'optionalSpecifications',
                                      field.name,
                                      'name',
                                    ]);
                                    if (!value?.trim() && !sibling?.trim()) return Promise.resolve();
                                    if (value?.trim()) return Promise.resolve();
                                    return Promise.reject(new Error('Enter a preference value'));
                                  },
                                }),
                              ]}
                            >
                              <Input placeholder="Preferred value" aria-label="Optional specification value" />
                            </Form.Item>
                          </Col>
                          <Col>
                            <Button
                              aria-label="Remove optional specification"
                              icon={<MinusCircleOutlined />}
                              onClick={() => remove(field.name)}
                            />
                          </Col>
                        </Row>
                      ))}
                      <Button type="dashed" onClick={() => add({ name: '', value: '' })} icon={<PlusOutlined />}>
                        Add optional specification
                      </Button>
                    </Space>
                  )}
                </Form.List>
              </Form.Item>
              <Form.Item name="description" label="Description"><TextArea rows={3} /></Form.Item>
            </div>
          )}
          {currentStep === 1 && (
            <div>
              <Row gutter={16}>
                  <Col xs={24} sm={8}>
                    <Form.Item name="targetQuantity" label="Purchase quantity" rules={[{ required: true, message: 'Quantity is required' }]}>
                      <InputNumber min={0.000001} max={1000000000} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item name="unit" label="Unit" rules={[{ required: true, message: 'Unit is required' }]}>
                      <Input placeholder="unit, units, pieces..." />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="minimumTargetPrice"
                      label="Minimum target unit price"
                      rules={[
                        { required: true, message: 'Minimum target unit price is required' },
                        { type: 'number', min: 0.000001, message: 'Minimum target unit price must be greater than zero' },
                      ]}
                    >
                      <InputNumber min={0.000001} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="maximumTargetPrice"
                      label="Maximum target unit price"
                      dependencies={['minimumTargetPrice']}
                      rules={[
                        { required: true, message: 'Maximum target unit price is required' },
                        { type: 'number', min: 0.000001, message: 'Maximum target unit price must be greater than zero' },
                        ({ getFieldValue }) => ({
                          validator(_, value: number | undefined) {
                            const minimum = getFieldValue('minimumTargetPrice') as number | undefined;
                            if (value === undefined || minimum === undefined || value >= minimum) {
                              return Promise.resolve();
                            }
                            return Promise.reject(new Error('Maximum target price must be at least the minimum'));
                          },
                        }),
                      ]}
                    >
                      <InputNumber min={0.000001} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="currency"
                      label="Currency"
                      rules={[
                        { required: true, whitespace: true, message: 'Currency is required' },
                        { pattern: /^[A-Za-z]{3}$/, message: 'Enter a 3-letter currency code' },
                      ]}
                    >
                      <Input placeholder="e.g. INR" maxLength={3} />
                    </Form.Item>
                  </Col>
              </Row>
              <Form.Item
                name="waitingPeriodDays"
                label="How many days are you willing to wait?"
                rules={isAIDraftFlow ? [
                  { required: true, message: 'Please enter how many days you are willing to wait' },
                  { type: 'number', min: 1, max: 3650, message: 'Enter a waiting period from 1 to 3650 days' },
                  {
                    validator: async (_, value: number | undefined) => {
                      if (value === undefined || Number.isInteger(value)) return;
                      throw new Error('Waiting period must be a whole number of days');
                    },
                  },
                ] : undefined}
              >
                <InputNumber
                  min={1}
                  max={3650}
                  precision={0}
                  addonAfter="days"
                  placeholder="e.g. 30"
                  style={{ width: '100%', maxWidth: 360 }}
                />
              </Form.Item>
            </div>
          )}
          {currentStep === 2 && (
            <div>
              <Form.Item
                name="deliveryLocation"
                label="Delivery location"
                rules={hasDeliveryLocation ? [{ required: true, whitespace: true, message: 'Delivery location is required by your reviewed requirements' }] : undefined}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="deliveryRequirementsText"
                label="Delivery requirements"
                rules={hasOtherDeliveryConstraints ? [{ required: true, whitespace: true, message: 'Delivery requirements are required by your reviewed requirements' }] : undefined}
              >
                <TextArea rows={3} placeholder="Timing, instructions, or other delivery constraints" />
              </Form.Item>
              {!isAIDraftFlow && (
                <Form.Item
                  name="deliveryDuration"
                  label="Expected delivery duration"
                  rules={hasDeliveryDuration ? [{ required: true, whitespace: true, message: 'Delivery duration is required by your reviewed requirements' }] : undefined}
                >
                  <Input placeholder="e.g. within 3 weeks" />
                </Form.Item>
              )}
              <Form.Item name="additionalRequirements" label="Additional requirements">
                <TextArea rows={3} />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="deadline" label="Fulfillment target date"><DatePicker style={{ width: '100%' }} /></Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="shippingTerms" label="Preferred delivery method">
                    <Select
                      allowClear
                      options={[
                        { label: 'Doorstep Pallet Delivery', value: 'Doorstep Delivery' },
                        { label: 'Warehouse / Dock Pickup', value: 'Warehouse Pickup' },
                        { label: 'Expedited Air Freight', value: 'Expedited Air' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <div style={{ background: '#F5F7FA', padding: 20, borderRadius: 8 }}>
                <Title level={5}>Review Your Demand Submission</Title>
                <Text strong>{form.getFieldValue('title') || 'Product name required'}</Text>
                <Paragraph>{form.getFieldValue('category') || 'Category not specified'}</Paragraph>
                {isAIDraftFlow && (
                  <Alert
                    type="info"
                    showIcon
                    title="Mandatory specifications and optional preferences are preserved as separate entries."
                  />
                )}
              </div>
            </div>
          )}
          <Divider style={{ margin: '24px 0 16px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <Button disabled={currentStep === 0 || loading} onClick={handlePrev} icon={<ArrowLeftOutlined />}>
                Previous
              </Button>
              {isAIDraftFlow && (
                <Button style={{ marginLeft: 8 }} disabled={loading} onClick={handleCancel}>
                  Cancel
                </Button>
              )}
            </div>
            <Button
              type="primary"
              onClick={() => void handleNext()}
              loading={loading}
              disabled={
                loading ||
                (isAIDraftFlow && !reviewedDraft)
              }
              icon={currentStep === 2 ? <CheckCircleOutlined /> : <ArrowRightOutlined />}
            >
              {currentStep === 2 ? 'Submit Demand' : 'Next Step'}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default CreateDemand;
