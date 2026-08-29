package com.routeledger.service;

import com.routeledger.domain.Product;
import com.routeledger.dto.PageResponse;
import com.routeledger.dto.ProductDtos;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Catalogue of what the business delivers. Prices are integer paise, never floating point. */
@Service
public class ProductService {

    private final ProductRepository products;
    private final SubscriptionRepository subscriptions;

    public ProductService(ProductRepository products, SubscriptionRepository subscriptions) {
        this.products = products;
        this.subscriptions = subscriptions;
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductDtos.ProductView> page(Long businessId, Pageable pageable) {
        return PageResponse.from(products.findByBusinessIdOrderByNameAsc(businessId, pageable), this::toView);
    }

    @Transactional(readOnly = true)
    public List<ProductDtos.ProductView> active(Long businessId) {
        List<Product> found = products.findByBusinessIdAndActiveTrueOrderByNameAsc(businessId);
        List<ProductDtos.ProductView> views = new ArrayList<>(found.size());
        for (Product product : found) {
            views.add(toView(product));
        }
        return views;
    }

    @Transactional(readOnly = true)
    public ProductDtos.ProductView get(Long businessId, Long id) {
        return toView(require(businessId, id));
    }

    @Transactional(readOnly = true)
    public Product require(Long businessId, Long id) {
        return products.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> NotFoundException.of("Product", id));
    }

    @Transactional
    public ProductDtos.ProductView create(Long businessId, ProductDtos.ProductRequest request) {
        String name = request.name().trim();
        if (products.existsByBusinessIdAndNameIgnoreCase(businessId, name)) {
            throw new ConflictException("'" + name + "' is already in your catalogue.");
        }
        Product product = new Product();
        product.setBusinessId(businessId);
        apply(product, request);
        products.save(product);
        return toView(product);
    }

    @Transactional
    public ProductDtos.ProductView update(Long businessId, Long id, ProductDtos.ProductRequest request) {
        Product product = require(businessId, id);
        String name = request.name().trim();
        if (!product.getName().equalsIgnoreCase(name)
                && products.existsByBusinessIdAndNameIgnoreCase(businessId, name)) {
            throw new ConflictException("'" + name + "' is already in your catalogue.");
        }
        apply(product, request);
        products.save(product);
        return toView(product);
    }

    @Transactional
    public ProductDtos.ProductView setActive(Long businessId, Long id, boolean active) {
        Product product = require(businessId, id);
        product.setActive(active);
        products.save(product);
        return toView(product);
    }

    private void apply(Product product, ProductDtos.ProductRequest request) {
        product.setName(request.name().trim());
        product.setUnitLabel(request.unitLabel().trim());
        product.setCategory(request.category() == null || request.category().isBlank()
                ? "General" : request.category().trim());
        product.setPricePaise(request.pricePaise());
        if (request.active() != null) {
            product.setActive(request.active());
        }
    }

    private ProductDtos.ProductView toView(Product product) {
        long lines = subscriptions.countByProductIdAndActiveTrue(product.getId());
        return new ProductDtos.ProductView(product.getId(), product.getName(), product.getUnitLabel(),
                product.getCategory(), product.getPricePaise(), product.isActive(), (int) lines);
    }
}
